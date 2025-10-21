"use client";

import { useState } from "react";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useEncryptInput } from "./useEncryptInput";
import { FheTypes } from "cofhejs/web";

export const INTEREST_CATEGORIES = [
    "FHE",
    "ZK",
    "Web3",
    "AI",
    "DeFi",
    "Blockchain",
    "Smart Contracts",
    "Crypto"
] as const;

export type InterestIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Mock user data - in real app, these would be addresses from the blockchain
const MOCK_USERS = [
    "0x" + Math.random().toString(16).slice(2, 6) + "..." + Math.random().toString(16).slice(2, 6),
    "0x" + Math.random().toString(16).slice(2, 6) + "..." + Math.random().toString(16).slice(2, 6),
    "0x" + Math.random().toString(16).slice(2, 6) + "..." + Math.random().toString(16).slice(2, 6),
    "0x" + Math.random().toString(16).slice(2, 6) + "..." + Math.random().toString(16).slice(2, 6)
];

// Mock chat messages
const MOCK_CHATS: Record<string, { sender: string; message: string; timestamp: number }[]> = {
    "0x1234...5678": [
        { sender: "me", message: "Hello! We matched based on our encrypted interests!", timestamp: Date.now() - 3600000 },
        { sender: "0x1234...5678", message: "Hi! Yes, it's fascinating how this works.", timestamp: Date.now() - 3500000 }
    ],
    "0x2345...6789": [
        { sender: "me", message: "Hey! Nice to meet you anonymously!", timestamp: Date.now() - 7200000 },
        { sender: "0x2345...6789", message: "Likewise! The privacy aspect is great.", timestamp: Date.now() - 7100000 }
    ]
};

// Berlin coordinates (approximate center)
const BERLIN_BOUNDS = {
    north: 52.6755,
    south: 52.3383,
    east: 13.7612,
    west: 13.0884
};

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
    const [selectedInterests, setSelectedInterests] = useState<boolean[]>(Array(8).fill(false));
    const [hasProfile, setHasProfile] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string>("");
    const [currentUserIndex, setCurrentUserIndex] = useState(0);
    const [matches, setMatches] = useState<string[]>([]);
    const [chatMessages, setChatMessages] = useState<Record<string, { sender: string; message: string; timestamp: number }[]>>({});
    const [newMessage, setNewMessage] = useState("");
    const [matchStatus, setMatchStatus] = useState<{
        isProcessing: boolean;
        score?: number;
        isMatch?: boolean;
    }>({ isProcessing: false });

    // Location verification states
    const [locationStatus, setLocationStatus] = useState<{
        isRequesting: boolean;
        isVerifying: boolean;
        isVerified: boolean;
        error?: string;
    }>({
        isRequesting: false,
        isVerifying: false,
        isVerified: false
    });

    const { writeContractAsync: submitProfile, isPending: isSubmitting } = useScaffoldWriteContract("BlindMatch");
    const { onEncryptInput, isEncryptingInput } = useEncryptInput();

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

    const requestLocation = () => {
        setLocationStatus(prev => ({ ...prev, isRequesting: true, error: undefined }));

        if (!navigator.geolocation) {
            setLocationStatus(prev => ({
                ...prev,
                isRequesting: false,
                error: "Geolocation is not supported by your browser"
            }));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                setLocationStatus(prev => ({ ...prev, isVerifying: true }));

                // Simulate ZK proof generation
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Check if location is within Berlin bounds
                const isInBerlin =
                    position.coords.latitude >= BERLIN_BOUNDS.south &&
                    position.coords.latitude <= BERLIN_BOUNDS.north &&
                    position.coords.longitude >= BERLIN_BOUNDS.west &&
                    position.coords.longitude <= BERLIN_BOUNDS.east;

                if (isInBerlin) {
                    // Simulate ZK proof verification
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    setLocationStatus(prev => ({
                        ...prev,
                        isRequesting: false,
                        isVerifying: false,
                        isVerified: true
                    }));
                } else {
                    setLocationStatus(prev => ({
                        ...prev,
                        isRequesting: false,
                        isVerifying: false,
                        error: "Location must be within Berlin"
                    }));
                }
            },
            () => {
                setLocationStatus(prev => ({
                    ...prev,
                    isRequesting: false,
                    error: "Unable to retrieve your location"
                }));
            }
        );
    };

    const handleSubmitProfile = async () => {
        if (!locationStatus.isVerified) {
            setLocationStatus(prev => ({
                ...prev,
                error: "Please verify your location first"
            }));
            return;
        }

        const bitmap = convertToBitmap(selectedInterests);
        console.log(`Interest bitmap: ${bitmap} (binary: ${bitmap.toString(2).padStart(8, '0')})`);

        const encryptAndSubmit = async () => {
            const encryptedInterests = await onEncryptInput(FheTypes.Uint8, bitmap.toString());
            console.log(`Encrypted interests: ${encryptedInterests}`);

            try {
                await submitProfile({ functionName: "submitProfile", args: [encryptedInterests] });
                setHasProfile(true);
            } catch (error) {
                console.error("Error submitting profile:", error);
            }
        };

        encryptAndSubmit();
    };

    const handleSwipe = async (direction: 'left' | 'right') => {
        if (direction === 'right') {
            setMatchStatus({ isProcessing: true });
            try {
                // In a real app, this would trigger the FHE computation
                // For now, we'll simulate a match with 50% probability
                const isMatch = Math.random() > 0.5;
                const score = Math.floor(Math.random() * 8) + 1;

                if (isMatch) {
                    const matchedAddress = MOCK_USERS[currentUserIndex];
                    setMatches(prev => [...prev, matchedAddress]);
                    setChatMessages(prev => ({
                        ...prev,
                        [matchedAddress]: MOCK_CHATS[matchedAddress] || []
                    }));
                }

                setMatchStatus({
                    isProcessing: false,
                    score,
                    isMatch
                });
            } catch (error) {
                console.error("Error calculating match:", error);
                setMatchStatus({ isProcessing: false });
            }
        }
        setCurrentUserIndex(prev => (prev + 1) % MOCK_USERS.length);
    };

    const sendMessage = (recipient: string) => {
        if (!newMessage.trim()) return;

        setChatMessages(prev => ({
            ...prev,
            [recipient]: [
                ...(prev[recipient] || []),
                {
                    sender: "me",
                    message: newMessage,
                    timestamp: Date.now()
                }
            ]
        }));
        setNewMessage("");
    };

    if (!hasProfile) {
        return (
            <div className="flex flex-col bg-base-900 px-10 py-10 text-center items-start rounded-3xl gap-4">
                <h2 className="text-2xl font-bold">Create Your Private Profile</h2>

                {/* Location Verification Section */}
                <div className="w-full">
                    <h3 className="text-xl font-semibold mb-2">Location Verification</h3>
                    <p className="text-sm text-gray-500 mb-4">
                        Verify that you are in Berlin using zero-knowledge proofs.
                        Your exact location will never be revealed.
                    </p>

                    {!locationStatus.isVerified ? (
                        <div className="flex flex-col gap-4">
                            <button
                                className={`btn btn-primary ${locationStatus.isRequesting || locationStatus.isVerifying ? "btn-disabled" : ""}`}
                                onClick={requestLocation}
                            >
                                {locationStatus.isRequesting && "Requesting Location..."}
                                {locationStatus.isVerifying && "Generating ZK Proof..."}
                                {!locationStatus.isRequesting && !locationStatus.isVerifying && "Verify Location"}
                            </button>

                            {locationStatus.error && (
                                <p className="text-error text-sm">{locationStatus.error}</p>
                            )}
                        </div>
                    ) : (
                        <div className="alert alert-success">
                            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Location verified with ZK proof</span>
                        </div>
                    )}
                </div>

                {/* Interests Selection Section */}
                <div className="w-full">
                    <h3 className="text-xl font-semibold mb-2">Select Your Interests</h3>
                    <p className="text-sm text-gray-500 mb-4">Your interests will be encrypted and never revealed</p>

                    <div className="grid grid-cols-2 gap-4 w-full">
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
                </div>

                <button
                    className={`btn btn-primary ${isSubmitting || isEncryptingInput ? "btn-disabled" : ""}`}
                    onClick={handleSubmitProfile}
                >
                    {isSubmitting || isEncryptingInput ? (
                        <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                        "Create Private Profile"
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col bg-white/5 px-10 py-10 text-center items-start rounded-3xl gap-4">
            <h2 className="text-2xl font-bold">Private Matching</h2>

            {/* Main App Section */}
            <div className="w-full flex flex-col gap-4">
                {/* User Selection and Matching Section */}
                <div className="w-full">
                    <h3 className="text-xl font-semibold mb-2">Find Matches</h3>
                    <div className="flex flex-col gap-4">
                        {MOCK_USERS[currentUserIndex] && (
                            <div className="card w-96 bg-base-100 shadow-xl">
                                <figure className="px-10 pt-10">
                                    <div className="avatar placeholder">
                                        <div className="bg-neutral text-neutral-content rounded-full w-24">
                                            <span className="text-3xl">👤</span>
                                        </div>
                                    </div>
                                </figure>
                                <div className="card-body items-center text-center">
                                    <h2 className="card-title">{MOCK_USERS[currentUserIndex]}</h2>
                                    <p className="text-sm text-gray-500">Interests are encrypted and private</p>
                                    <div className="card-actions justify-end">
                                        <button className="btn btn-circle btn-outline" onClick={() => handleSwipe('left')}>
                                            ❌
                                        </button>
                                        <button className="btn btn-circle btn-outline" onClick={() => handleSwipe('right')}>
                                            ❤️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Match Status */}
                {matchStatus.isProcessing && (
                    <div className="flex flex-col gap-2 p-4 bg-base-200 rounded-lg">
                        <h4 className="font-semibold">Calculating Match</h4>
                        <p>Computing similarity with encrypted interests...</p>
                    </div>
                )}

                {/* My Matches Section */}
                <div className="w-full">
                    <h3 className="text-xl font-semibold mb-2">My Matches</h3>
                    <div className="flex flex-col gap-2">
                        {matches.length > 0 ? (
                            matches.map((matchAddress) => (
                                <div key={matchAddress} className="p-4 bg-base-200 rounded-lg">
                                    <div className="flex justify-between items-center mb-2">
                                        <div>
                                            <h4 className="font-bold">{matchAddress}</h4>
                                            <p className="text-sm text-gray-500">Matched based on encrypted interests</p>
                                        </div>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => setSelectedUser(matchAddress)}
                                        >
                                            Chat
                                        </button>
                                    </div>
                                    {selectedUser === matchAddress && (
                                        <div className="mt-4">
                                            <div className="h-64 overflow-y-auto bg-base-100 rounded-lg p-4 mb-2">
                                                {chatMessages[matchAddress]?.map((msg, index) => (
                                                    <div
                                                        key={index}
                                                        className={`chat ${msg.sender === 'me' ? 'chat-end' : 'chat-start'}`}
                                                    >
                                                        <div className="chat-bubble">
                                                            {msg.message}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="input input-bordered flex-1"
                                                    value={newMessage}
                                                    onChange={(e) => setNewMessage(e.target.value)}
                                                    placeholder="Type a message..."
                                                />
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => sendMessage(matchAddress)}
                                                >
                                                    Send
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p>No matches yet</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
