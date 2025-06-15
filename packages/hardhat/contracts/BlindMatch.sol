// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract BlindMatch {
    // Interest categories (8 interests for gas efficiency)
    uint8 public constant TOTAL_INTERESTS = 8;
    uint8 public constant MIN_INTERESTS = 4;

    // Similarity threshold for matching (out of 8 possible common interests)
    uint8 public constant MATCH_THRESHOLD = 3; // ~38% similarity (3 out of 8)

    struct UserProfile {
        bool exists;
        euint8 interestsBitmap; // 8-bit encrypted bitmap of interests
        address[] matches;
        uint256 profileCreatedAt;
    }

    struct MatchRequest {
        address requester;
        address target;
        euint8 similarityScore;
        bool scoreDecrypted;
        uint8 decryptedScore;
        bool processed;
        uint256 timestamp;
        ebool isMatchEncrypted;
        bool matchDecrypted;
        bool isMatch;
    }

    mapping(address => UserProfile) public profiles;
    mapping(bytes32 => MatchRequest) public matchRequests;
    address[] public allUsers;

    // Events
    event ProfileCreated(address indexed user, uint256 timestamp);
    event MatchRequested(address indexed requester, address indexed target, bytes32 requestId);
    event MatchFound(address indexed user1, address indexed user2, uint256 timestamp);
    event SimilarityCalculated(address indexed user1, address indexed user2, bytes32 requestId);
    event MatchDecryptionRequested(bytes32 indexed requestId);
    event ScoreDecryptionRequested(bytes32 indexed requestId);
    event MatchDecrypted(bytes32 indexed requestId, bool isMatch);
    event ScoreDecrypted(bytes32 indexed requestId, uint8 score);

    modifier onlyRegisteredUser() {
        require(profiles[msg.sender].exists, "User not registered");
        _;
    }

    modifier userExists(address user) {
        require(profiles[user].exists, "Target user does not exist");
        _;
    }

    /**
     * @dev Submit user profile with encrypted interests bitmap
     * @param encryptedInterests 8-bit encrypted bitmap representing user's interests
     */
    function submitProfile(InEuint8 calldata encryptedInterests) external {
        require(!profiles[msg.sender].exists, "Profile already exists");

        euint8 interests = FHE.asEuint8(encryptedInterests);
        FHE.allowThis(interests); // Grant access to this contract

        profiles[msg.sender] = UserProfile({
            exists: true,
            interestsBitmap: interests,
            matches: new address[](0),
            profileCreatedAt: block.timestamp
        });

        allUsers.push(msg.sender);
        emit ProfileCreated(msg.sender, block.timestamp);
    }

    /**
     * @dev Calculate similarity between two users using encrypted bitwise operations
     * @param targetUser Address of the user to compare with
     * @return requestId The ID of the match request
     */
    function calculateSimilarity(
        address targetUser
    ) external onlyRegisteredUser userExists(targetUser) returns (bytes32 requestId) {
        require(targetUser != msg.sender, "Cannot match with yourself");
        require(!isAlreadyMatched(msg.sender, targetUser), "Users already matched");

        return _calculateSimilarity(msg.sender, targetUser);
    }

    function _calculateSimilarity(address requester, address targetUser) internal returns (bytes32 requestId) {
        // Get both users' interest bitmaps
        euint8 myInterests = profiles[requester].interestsBitmap;
        euint8 theirInterests = profiles[targetUser].interestsBitmap;

        // Calculate common interests using bitwise AND
        euint8 commonInterestsBitmap = FHE.and(myInterests, theirInterests);
        FHE.allowThis(commonInterestsBitmap);

        // Count the number of set bits (common interests) using efficient bit counting
        euint8 similarityScore = _countSetBits(commonInterestsBitmap);
        FHE.allowThis(similarityScore);

        // Check if similarity meets threshold for matching
        euint8 threshold = FHE.asEuint8(MATCH_THRESHOLD);
        FHE.allowThis(threshold);
        ebool isMatchEncrypted = FHE.gte(similarityScore, threshold);
        FHE.allowThis(isMatchEncrypted);

        // Generate request ID
        requestId = keccak256(abi.encodePacked(requester, targetUser, block.timestamp, block.number));

        // Store the match request
        matchRequests[requestId] = MatchRequest({
            requester: requester,
            target: targetUser,
            similarityScore: similarityScore,
            scoreDecrypted: false,
            decryptedScore: 0,
            processed: true,
            timestamp: block.timestamp,
            isMatchEncrypted: isMatchEncrypted,
            matchDecrypted: false,
            isMatch: false
        });

        emit SimilarityCalculated(requester, targetUser, requestId);
        return requestId;
    }

    /**
     * @dev Count set bits in an 8-bit encrypted integer using efficient FHE operations
     * Much more gas-efficient than the 32-bit version
     */
    function _countSetBits(euint8 value) internal returns (euint8) {
        euint8 count = FHE.asEuint8(0);
        euint8 temp = value;
        FHE.allowThis(count);
        FHE.allowThis(temp);

        // Check each bit position (only 8 iterations now!)
        for (uint8 i = 0; i < 8; i++) {
            euint8 bitMask = FHE.asEuint8(1 << i);
            euint8 bitValue = FHE.and(temp, bitMask);

            // Check if bit is set (non-zero)
            ebool bitIsSet = FHE.gt(bitValue, FHE.asEuint8(0));
            euint8 addValue = FHE.select(bitIsSet, FHE.asEuint8(1), FHE.asEuint8(0));
            count = FHE.add(count, addValue);
            FHE.allowThis(count);
        }

        return count;
    }

    /**
     * @dev Request decryption of match result (whether users match)
     * @param requestId The ID of the match request
     */
    function requestMatchDecryption(bytes32 requestId) external {
        MatchRequest storage request = matchRequests[requestId];
        require(request.processed, "Match calculation not found");
        require(!request.matchDecrypted, "Match already decrypted");
        require(msg.sender == request.requester || msg.sender == request.target, "Only involved parties can decrypt");

        // Request decryption using FHENIX's built-in decryption
        FHE.decrypt(request.isMatchEncrypted);

        emit MatchDecryptionRequested(requestId);
    }

    /**
     * @dev Request decryption of similarity score
     * @param requestId The ID of the match request
     */
    function requestScoreDecryption(bytes32 requestId) external {
        MatchRequest storage request = matchRequests[requestId];
        require(request.processed, "Match calculation not found");
        require(!request.scoreDecrypted, "Score already decrypted");
        require(msg.sender == request.requester || msg.sender == request.target, "Only involved parties can decrypt");

        // Request decryption of similarity score
        FHE.decrypt(request.similarityScore);

        emit ScoreDecryptionRequested(requestId);
    }

    /**
     * @dev Retrieve and process decrypted match result
     * @param requestId The ID of the match request
     */
    function processMatchDecryption(bytes32 requestId) external {
        MatchRequest storage request = matchRequests[requestId];
        require(request.processed, "Match calculation not found");
        require(!request.matchDecrypted, "Match already processed");

        // Get decrypted result safely
        (bool isMatch, bool ready) = FHE.getDecryptResultSafe(request.isMatchEncrypted);
        require(ready, "Decryption not ready yet");

        request.isMatch = isMatch;
        request.matchDecrypted = true;

        if (isMatch) {
            // Add both users to each other's matches
            profiles[request.requester].matches.push(request.target);
            profiles[request.target].matches.push(request.requester);

            emit MatchFound(request.requester, request.target, block.timestamp);
        }

        emit MatchDecrypted(requestId, isMatch);
    }

    /**
     * @dev Retrieve and process decrypted similarity score
     * @param requestId The ID of the match request
     */
    function processScoreDecryption(bytes32 requestId) external {
        MatchRequest storage request = matchRequests[requestId];
        require(request.processed, "Match calculation not found");
        require(!request.scoreDecrypted, "Score already processed");

        // Get decrypted result safely
        (uint8 score, bool ready) = FHE.getDecryptResultSafe(request.similarityScore);
        require(ready, "Decryption not ready yet");

        request.decryptedScore = score;
        request.scoreDecrypted = true;

        emit ScoreDecrypted(requestId, score);
    }

    /**
     * @dev Check if two users are already matched
     * @param user1 First user address
     * @param user2 Second user address
     * @return True if users are already matched
     */
    function isAlreadyMatched(address user1, address user2) public view returns (bool) {
        address[] memory user1Matches = profiles[user1].matches;
        for (uint256 i = 0; i < user1Matches.length; i++) {
            if (user1Matches[i] == user2) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Get user's matches (only callable by the user themselves)
     * @return Array of addresses that matched with the caller
     */
    function getMyMatches() external view onlyRegisteredUser returns (address[] memory) {
        return profiles[msg.sender].matches;
    }

    /**
     * @dev Get match count for a user
     * @param user Address to check
     * @return Number of matches
     */
    function getMatchCount(address user) external view userExists(user) returns (uint256) {
        return profiles[user].matches.length;
    }

    /**
     * @dev Get total number of registered users
     * @return Total user count
     */
    function getTotalUsers() external view returns (uint256) {
        return allUsers.length;
    }

    /**
     * @dev Get all registered users
     * @return Array of all user addresses
     */
    function getAllUsers() external view returns (address[] memory) {
        return allUsers;
    }

    /**
     * @dev Check if a user has a profile
     * @param user Address to check
     * @return True if user has a profile
     */
    function hasProfile(address user) external view returns (bool) {
        return profiles[user].exists;
    }

    /**
     * @dev Get match request details
     * @param requestId The request ID
     * @return requester The address of the requester
     * @return target The address of the target
     * @return processed Whether the match request has been processed
     * @return timestamp The timestamp of the match request
     * @return scoreDecrypted Whether the similarity score has been decrypted
     * @return decryptedScore The decrypted similarity score
     * @return matchDecrypted Whether the match result has been decrypted
     * @return isMatch Whether the match result is true
     */
    function getMatchRequest(
        bytes32 requestId
    )
        external
        view
        returns (
            address requester,
            address target,
            bool processed,
            uint256 timestamp,
            bool scoreDecrypted,
            uint8 decryptedScore,
            bool matchDecrypted,
            bool isMatch
        )
    {
        MatchRequest memory request = matchRequests[requestId];
        return (
            request.requester,
            request.target,
            request.processed,
            request.timestamp,
            request.scoreDecrypted,
            request.decryptedScore,
            request.matchDecrypted,
            request.isMatch
        );
    }

    /**
     * @dev Batch similarity calculation for multiple users
     * @param targets Array of user addresses to calculate similarity with
     * @return requestIds Array of match request IDs for each target
     */
    function batchCalculateSimilarity(
        address[] calldata targets
    ) external onlyRegisteredUser returns (bytes32[] memory requestIds) {
        require(targets.length > 0, "No targets provided");
        require(targets.length <= 10, "Too many targets"); // Gas limit protection

        requestIds = new bytes32[](targets.length);

        for (uint256 i = 0; i < targets.length; i++) {
            require(profiles[targets[i]].exists, "Target user does not exist");
            require(targets[i] != msg.sender, "Cannot match with yourself");
            require(!isAlreadyMatched(msg.sender, targets[i]), "Already matched with this user");

            requestIds[i] = _calculateSimilarity(msg.sender, targets[i]);
        }

        return requestIds;
    }

    /**
     * @dev Emergency function to remove a user's profile
     */
    function deleteProfile() external onlyRegisteredUser {
        delete profiles[msg.sender];

        // Remove from allUsers array
        for (uint256 i = 0; i < allUsers.length; i++) {
            if (allUsers[i] == msg.sender) {
                allUsers[i] = allUsers[allUsers.length - 1];
                allUsers.pop();
                break;
            }
        }
    }
}
