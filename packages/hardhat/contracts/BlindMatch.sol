// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

interface IOracle {
    function requestDecryption(
        uint32 value,
        bytes4 callbackSelector,
        bytes32 requestId,
        uint256 deadline
    ) external returns (uint256);
}

// import "@fhenixprotocol/cofhe-contracts/OracleCaller.sol"; // Removed, not found in package

// contract BlindMatch is OracleCaller {
contract BlindMatch {
    // Interest categories (32 interests as specified)
    uint8 public constant TOTAL_INTERESTS = 32;
    uint8 public constant MIN_INTERESTS = 16;

    // Similarity threshold for matching (out of MIN_INTERESTS)
    uint8 public constant MATCH_THRESHOLD = 8; // 50% similarity

    struct UserProfile {
        bool exists;
        euint32 interestsBitmap; // 32-bit encrypted bitmap of interests
        address[] matches;
        uint256 profileCreatedAt;
    }

    struct MatchRequest {
        address requester;
        address target;
        euint8 similarityScore;
        bool processed;
        uint256 timestamp;
        bool isMatch;
        bool matchDecrypted;
    }

    mapping(address => UserProfile) public profiles;
    mapping(bytes32 => MatchRequest) public matchRequests;
    mapping(uint256 => bytes32) public pendingDecryptions;

    address[] public allUsers;

    // Events
    event ProfileCreated(address indexed user, uint256 timestamp);
    event MatchRequested(address indexed requester, address indexed target, bytes32 requestId);
    event MatchFound(address indexed user1, address indexed user2, uint256 timestamp);
    event SimilarityCalculated(address indexed user1, address indexed user2, bytes32 requestId);
    event DecryptionRequested(bytes32 indexed requestId, uint256 decryptionId);
    event DecryptionCompleted(bytes32 indexed requestId, bool isMatch);

    // Interest categories for reference (not used in contract logic)
    string[32] public interestCategories = [
        "Travel",
        "Music",
        "Fitness / Gym",
        "Movies & TV",
        "Outdoors / Hiking",
        "Pets / Animals",
        "Reading / Books",
        "Cooking / Foodie",
        "Art & Museums",
        "Gaming (video)",
        "Dancing",
        "Photography",
        "Nightlife / Bars",
        "Live Sports",
        "Podcasts",
        "Comedy",
        "Board Games",
        "Fashion",
        "Coffee & Cafes",
        "Craft Beer / Wine",
        "Sustainability / Climate",
        "Spirituality / Mindfulness",
        "Crypto / Web3",
        "Volunteering",
        "Tech & Gadgets",
        "Entrepreneurship",
        "Languages & Culture",
        "Astrology",
        "Politics & Civic Issues",
        "Parenting",
        "DIY / Woodwork",
        "Tattoos & Piercings"
    ];

    address public oracle;

    modifier onlyRegisteredUser() {
        require(profiles[msg.sender].exists, "User not registered");
        _;
    }

    modifier userExists(address user) {
        require(profiles[user].exists, "Target user does not exist");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle can call this function");
        _;
    }

    function setOracle(address _oracle) public {
        // In production, restrict this to onlyOwner or constructor
        oracle = _oracle;
    }

    /**
     * @dev Submit user profile with encrypted interests bitmap
     * @param encryptedInterests 32-bit encrypted bitmap representing user's interests
     */
    function submitProfile(InEuint32 calldata encryptedInterests) external {
        require(!profiles[msg.sender].exists, "Profile already exists");

        euint32 interests = FHE.asEuint32(encryptedInterests);
        FHE.allowThis(interests);

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
     * @dev Calculate similarity and process match in a single transaction
     * @param targetUser Address of the user to compare with
     * @return requestId The ID of the match request
     */
    function calculateAndMatch(
        address targetUser
    ) external onlyRegisteredUser userExists(targetUser) returns (bytes32 requestId) {
        require(targetUser != msg.sender, "Cannot match with yourself");
        require(!isAlreadyMatched(msg.sender, targetUser), "Users already matched");

        // Get both users' interest bitmaps
        euint32 myInterests = profiles[msg.sender].interestsBitmap;
        euint32 theirInterests = profiles[targetUser].interestsBitmap;

        // Calculate similarity using FHE operations
        // Count common interests using AND operation (both users have the interest)
        euint32 commonInterests = FHE.mul(myInterests, theirInterests);

        // Convert to smaller type for efficiency
        euint8 similarityScore = FHE.asEuint8(commonInterests);
        FHE.allowThis(similarityScore);

        // Check if similarity meets threshold
        euint8 threshold = FHE.asEuint8(MATCH_THRESHOLD);
        ebool isMatchEncrypted = FHE.gte(similarityScore, threshold);

        FHE.allowThis(isMatchEncrypted);

        // Generate request ID
        requestId = keccak256(abi.encodePacked(msg.sender, targetUser, block.timestamp));

        // Store the match request
        matchRequests[requestId] = MatchRequest({
            requester: msg.sender,
            target: targetUser,
            similarityScore: similarityScore,
            processed: true,
            timestamp: block.timestamp,
            isMatch: false,
            matchDecrypted: false
        });

        // Request decryption of the match result
        // Assumes oracle is a contract with requestDecryption function
        uint256 decryptionId = IOracle(oracle).requestDecryption(
            uint32(uint256(uint160(bytes20(abi.encodePacked(isMatchEncrypted))))),
            this.handleMatchDecryption.selector,
            requestId,
            block.timestamp + 100
        );

        pendingDecryptions[decryptionId] = requestId;

        emit DecryptionRequested(requestId, decryptionId);
        emit SimilarityCalculated(msg.sender, targetUser, requestId);

        return requestId;
    }

    /**
     * @dev Callback function for handling match decryption results
     * @param requestId The ID of the match request
     * @param isMatch The decrypted match result
     */
    function handleMatchDecryption(bytes32 requestId, bool isMatch) external onlyOracle {
        MatchRequest storage request = matchRequests[requestId];
        require(request.processed && !request.matchDecrypted, "Invalid request state");

        request.isMatch = isMatch;
        request.matchDecrypted = true;

        if (isMatch) {
            // Add both users to each other's matches
            profiles[request.requester].matches.push(request.target);
            profiles[request.target].matches.push(request.requester);

            emit MatchFound(request.requester, request.target, block.timestamp);
        }

        emit DecryptionCompleted(requestId, isMatch);
    }

    /**
     * @dev Decrypt similarity score from a completed match calculation
     * @param user1 First user in the match calculation
     * @param user2 Second user in the match calculation
     * @param timestamp Approximate timestamp of the calculation
     * @return requestId The ID of the match request
     */
    function requestSimilarityScoreDecryption(
        address user1,
        address user2,
        uint256 timestamp
    ) external returns (bytes32 requestId) {
        require(msg.sender == user1 || msg.sender == user2, "Only involved parties can decrypt");

        // Generate the result ID
        requestId = keccak256(abi.encodePacked(user1, user2, timestamp));
        MatchRequest storage request = matchRequests[requestId];

        require(request.processed, "Match calculation not found or not processed");

        // Request decryption of the similarity score
        uint256 decryptionId = IOracle(oracle).requestDecryption(
            uint32(uint256(uint160(bytes20(abi.encodePacked(request.similarityScore))))),
            this.handleSimilarityScoreDecryption.selector,
            requestId,
            block.timestamp + 100
        );

        pendingDecryptions[decryptionId] = requestId;

        emit DecryptionRequested(requestId, decryptionId);

        return requestId;
    }

    /**
     * @dev Callback function for handling similarity score decryption results
     * @param requestId The ID of the match request
     * @param score The decrypted similarity score
     */
    function handleSimilarityScoreDecryption(bytes32 requestId, uint8 score) external onlyOracle {
        // Handle the decrypted similarity score
        // You can emit an event or store it if needed
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
     * @dev Get all registered users (for frontend to display potential matches)
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
     * @return processed Whether the request has been processed
     * @return timestamp When the request was made
     */
    function getMatchRequest(
        bytes32 requestId
    ) external view returns (address requester, address target, bool processed, uint256 timestamp) {
        MatchRequest memory request = matchRequests[requestId];
        return (request.requester, request.target, request.processed, request.timestamp);
    }

    /**
     * @dev Batch similarity calculation and matching for multiple users
     * @param targets Array of user addresses to calculate similarity with
     * @return requestIds Array of match request IDs for each target
     */
    function batchCalculateAndMatch(
        address[] calldata targets
    ) external onlyRegisteredUser returns (bytes32[] memory requestIds) {
        require(targets.length > 0, "No targets provided");
        require(targets.length <= 10, "Too many targets"); // Limit to prevent gas issues

        requestIds = new bytes32[](targets.length);

        for (uint256 i = 0; i < targets.length; i++) {
            require(profiles[targets[i]].exists, "Target user does not exist");
            require(targets[i] != msg.sender, "Cannot match with yourself");
            require(!isAlreadyMatched(msg.sender, targets[i]), "Already matched with this user");

            requestIds[i] = this.calculateAndMatch(targets[i]);
        }

        return requestIds;
    }

    /**
     * @dev Emergency function to remove a user's profile (only callable by the user)
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
