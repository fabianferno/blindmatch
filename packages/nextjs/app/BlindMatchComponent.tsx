"use client";

import { useCallback, useState } from "react";
import { useEncryptInput } from "./useEncryptInput";
import { FheTypes } from "cofhejs/web";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

export const INTEREST_CATEGORIES = [
    "Travel",
    "Music",
    "Fitness",
    "Movies & TV",
    "Outdoors",
    "Cooking",
    "Gaming",
    "Tech & Gadgets"
] as const;

export type InterestIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * BlindMatchComponent - A demonstration of Fully Homomorphic Encryption (FHE) in a dating app
 *
 * This component showcases how to:
 * 1. Create and manage user profiles with encrypted interests
 * 2. Calculate similarity between users using FHE
 * 3. Display match results and similarity scores
 * 4. Handle batch matching operations
 */

export const BlindMatchComponent = () => {
    const [selectedUser, setSelectedUser] = useState<string>("");
    const { data: allUsers } = useScaffoldReadContract({
        contractName: "BlindMatch",
        functionName: "getAllUsers",
    });

    return (
        <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-start rounded-3xl gap-4">
            <h2 className="text-2xl font-bold">BlindMatch Dating App</h2>

            {/* Profile Creation Section */}
            <div className="w-full">
                <h3 className="text-xl font-semibold mb-2">Create Your Profile</h3>
                <ProfileCreation />
            </div>

            {/* User Selection and Matching Section */}
            <div className="w-full">
                <h3 className="text-xl font-semibold mb-2">Find Matches</h3>
                <div className="flex flex-col gap-4">
                    <UserSelection users={allUsers} selectedUser={selectedUser} onSelect={setSelectedUser} />
                    {selectedUser && <MatchActions targetUser={selectedUser} />}
                </div>
            </div>

            {/* My Matches Section */}
            <div className="w-full">
                <h3 className="text-xl font-semibold mb-2">My Matches</h3>
                <MyMatches />
            </div>
        </div>
    );
};

/**
 * ProfileCreation Component
 * Handles the creation of user profiles with encrypted interests
 */
const ProfileCreation = () => {
    const [selectedInterests, setSelectedInterests] = useState<boolean[]>(Array(8).fill(false));
    const { isPending, writeContractAsync } = useScaffoldWriteContract({ contractName: "BlindMatch" });
    const { onEncryptInput, isEncryptingInput, inputEncryptionDisabled } = useEncryptInput();

    const handleInterestChange = (index: InterestIndex) => {
        const newInterests = [...selectedInterests];
        newInterests[index] = !newInterests[index];
        setSelectedInterests(newInterests);
    };

    const convertToBitmap = (interests: boolean[]): number => {
        return interests.reduce((acc, interest, index) => {
            return acc + (interest ? (1 << index) : 0);
        }, 0);
    };

    const handleSubmit = useCallback(() => {
        const bitmap = convertToBitmap(selectedInterests);
        console.log(`Interest bitmap: ${bitmap} (binary: ${bitmap.toString(2).padStart(8, '0')})`);

        const encryptAndSubmit = async () => {
            const encryptedInterests = await onEncryptInput(FheTypes.Uint8, bitmap.toString());
            writeContractAsync({ functionName: "submitProfile", args: [encryptedInterests] });
        };

        encryptAndSubmit();
    }, [selectedInterests, writeContractAsync, onEncryptInput]);

    const pending = isPending || isEncryptingInput;
    const hasSelectedInterests = selectedInterests.some(interest => interest);

    return (
        <div className="flex flex-col w-full gap-4">
            <div className="grid grid-cols-2 gap-4">
                {INTEREST_CATEGORIES.map((interest, index) => (
                    <label key={interest} className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="checkbox checkbox-primary"
                            checked={selectedInterests[index]}
                            onChange={() => handleInterestChange(index as InterestIndex)}
                        />
                        <span>{interest}</span>
                    </label>
                ))}
            </div>
            <div
                className={`btn btn-primary ${pending ? "btn-disabled" : ""} ${!hasSelectedInterests || inputEncryptionDisabled ? "btn-disabled" : ""}`}
                onClick={handleSubmit}
            >
                {pending && <span className="loading loading-spinner loading-xs"></span>}
                Create Profile
            </div>
        </div>
    );
};

/**
 * UserSelection Component
 * Displays a list of users to match with
 */
const UserSelection = ({ users, selectedUser, onSelect }: { users?: string[], selectedUser: string, onSelect: (user: string) => void }) => {
    return (
        <div className="flex flex-col gap-2">
            <select
                className="select select-bordered w-full"
                value={selectedUser}
                onChange={(e) => onSelect(e.target.value)}
            >
                <option value="">Select a user to match with</option>
                {users?.map((user) => (
                    <option key={user} value={user}>
                        {user.slice(0, 6)}...{user.slice(-4)}
                    </option>
                ))}
            </select>
        </div>
    );
};

/**
 * MatchActions Component
 * Handles the matching process with a selected user
 */
const MatchActions = ({ targetUser }: { targetUser: string }) => {
    const { isPending, writeContractAsync } = useScaffoldWriteContract({ contractName: "BlindMatch" });

    const handleMatch = useCallback(() => {
        writeContractAsync({ functionName: "calculateSimilarity", args: [targetUser] });
    }, [targetUser, writeContractAsync]);

    return (
        <div className="flex flex-row gap-2">
            <div
                className={`btn btn-primary flex-1 ${isPending ? "btn-disabled" : ""}`}
                onClick={handleMatch}
            >
                {isPending && <span className="loading loading-spinner loading-xs"></span>}
                Calculate Match
            </div>
        </div>
    );
};

/**
 * MyMatches Component
 * Displays the user's current matches
 */
const MyMatches = () => {
    const { data: matches } = useScaffoldReadContract({
        contractName: "BlindMatch",
        functionName: "getMyMatches",
    });

    return (
        <div className="flex flex-col gap-2">
            {matches && matches.length > 0 ? (
                matches.map((match: string) => (
                    <div key={match} className="p-2 bg-base-200 rounded-lg">
                        {match.slice(0, 6)}...{match.slice(-4)}
                    </div>
                ))
            ) : (
                <p>No matches yet</p>
            )}
        </div>
    );
};
