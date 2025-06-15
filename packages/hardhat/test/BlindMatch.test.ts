/* eslint-disable @typescript-eslint/no-unused-vars */
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers.js";
import hre from "hardhat";
import { cofhejs, Encryptable, FheTypes } from "cofhejs/node";
import { expect } from "chai";
import { ContractTransactionResponse, Log } from "ethers";
import { BlindMatch, MockOracle } from "../types/contracts.js";

describe("BlindMatch", function () {
  async function deployBlindMatchFixture() {
    const [owner, alice, bob, charlie] = await hre.ethers.getSigners();

    // Deploy mock oracle
    const MockOracle = await hre.ethers.getContractFactory("MockOracle");
    const mockOracle = (await MockOracle.deploy()) as unknown as MockOracle;

    // Deploy BlindMatch
    const BlindMatch = await hre.ethers.getContractFactory("BlindMatch");
    const blindMatch = (await BlindMatch.deploy()) as unknown as BlindMatch;
    await blindMatch.setOracle(await mockOracle.getAddress());

    return { blindMatch, mockOracle, owner, alice, bob, charlie };
  }

  describe("Profile Management", function () {
    beforeEach(function () {
      if (!hre.cofhe.isPermittedEnvironment("MOCK")) this.skip();
    });

    it("Should allow users to create profiles with encrypted interests", async function () {
      const { blindMatch, alice } = await loadFixture(deployBlindMatchFixture);

      // Initialize FHE for alice
      const initializeResult = await hre.cofhe.initializeWithHardhatSigner(alice);
      await hre.cofhe.expectResultSuccess(initializeResult);

      // Create a bitmap with some interests (e.g., first 16 bits set)
      const interestsBitmap = (1n << 16n) - 1n;
      const encryptResult = await cofhejs.encrypt([Encryptable.uint32(interestsBitmap)] as const);
      const [encryptedInterests] = await hre.cofhe.expectResultSuccess(encryptResult);

      // Submit profile
      const tx = await blindMatch.connect(alice).submitProfile(encryptedInterests);
      const receipt = await tx.wait();

      // Get addresses before filtering
      const aliceAddress = (await alice.getAddress()).toLowerCase();

      // Get the event from the contract interface
      const event = receipt?.logs.find(
        (log: Log & { fragment?: { name: string } }) =>
          log.fragment?.name === "ProfileCreated" && log.topics[1].toLowerCase() === aliceAddress,
      );

      const hasProfile = await blindMatch.hasProfile(await alice.getAddress());

      // Assertions
      if (!event) throw new Error("ProfileCreated event not found");
      if (!hasProfile) throw new Error("Profile not created");
    });

    it("Should not allow duplicate profiles", async function () {
      const { blindMatch, alice } = await loadFixture(deployBlindMatchFixture);

      // Initialize FHE
      const initializeResult = await hre.cofhe.initializeWithHardhatSigner(alice);
      await hre.cofhe.expectResultSuccess(initializeResult);

      // Create and submit first profile
      const encryptResult = await cofhejs.encrypt([Encryptable.uint32(1n)] as const);
      const [encryptedInterests] = await hre.cofhe.expectResultSuccess(encryptResult);
      await blindMatch.connect(alice).submitProfile(encryptedInterests);

      // Attempt to submit second profile
      const tx = blindMatch.connect(alice).submitProfile(encryptedInterests);
      await expect(tx).to.be.revertedWith("Profile already exists");
    });
  });

  describe("Matching Process", function () {
    beforeEach(function () {
      if (!hre.cofhe.isPermittedEnvironment("MOCK")) this.skip();
    });

    it("Should calculate similarity and process match between users", async function () {
      const { blindMatch, mockOracle, alice, bob } = await loadFixture(deployBlindMatchFixture);

      // Initialize FHE for both users
      const initializeResultAlice = await hre.cofhe.initializeWithHardhatSigner(alice);
      const initializeResultBob = await hre.cofhe.initializeWithHardhatSigner(bob);
      await hre.cofhe.expectResultSuccess(initializeResultAlice);
      await hre.cofhe.expectResultSuccess(initializeResultBob);

      // Create profiles with some matching interests
      const aliceInterests = 0b1111111111111111n; // First 16 interests
      const bobInterests = 0b1111111100000000n; // First 8 interests

      const encryptResultAlice = await cofhejs.encrypt([Encryptable.uint32(aliceInterests)] as const);
      const encryptResultBob = await cofhejs.encrypt([Encryptable.uint32(bobInterests)] as const);
      const [encryptedAliceInterests] = await hre.cofhe.expectResultSuccess(encryptResultAlice);
      const [encryptedBobInterests] = await hre.cofhe.expectResultSuccess(encryptResultBob);

      await blindMatch.connect(alice).submitProfile(encryptedAliceInterests);
      await blindMatch.connect(bob).submitProfile(encryptedBobInterests);

      // Wait for profiles to be registered
      await hre.network.provider.send("evm_mine");

      // Calculate match
      const tx = await blindMatch.connect(alice).calculateAndMatch(await bob.getAddress());
      const receipt = await tx.wait();

      // Get addresses before filtering
      const aliceAddress = (await alice.getAddress()).toLowerCase();
      const bobAddress = (await bob.getAddress()).toLowerCase();

      // Find the MatchRequested event
      const matchRequestedEvent = receipt?.logs.find(
        (log: Log & { fragment?: { name: string } }) =>
          log.fragment?.name === "MatchRequested" &&
          log.topics[1].toLowerCase() === aliceAddress &&
          log.topics[2].toLowerCase() === bobAddress,
      );

      if (!matchRequestedEvent) throw new Error("MatchRequested event not found");

      // Simulate oracle callback with match result
      const requestId = matchRequestedEvent.topics[3];
      await mockOracle.simulateDecryptionCallback(
        await blindMatch.getAddress(),
        requestId,
        true, // isMatch
      );

      // Verify match was recorded
      const matches = await blindMatch.connect(alice).getMyMatches();
      if (!matches.includes(await bob.getAddress())) throw new Error("Match not recorded");
    });

    it("Should not allow matching with non-existent users", async function () {
      const { blindMatch, alice, bob } = await loadFixture(deployBlindMatchFixture);

      // Initialize FHE for alice
      const initializeResult = await hre.cofhe.initializeWithHardhatSigner(alice);
      await hre.cofhe.expectResultSuccess(initializeResult);

      // Create profile for alice
      const encryptResult = await cofhejs.encrypt([Encryptable.uint32(1n)] as const);
      const [encryptedInterests] = await hre.cofhe.expectResultSuccess(encryptResult);
      await blindMatch.connect(alice).submitProfile(encryptedInterests);

      // Attempt to match with non-existent user
      const tx = blindMatch.connect(alice).calculateAndMatch(await bob.getAddress());
      await expect(tx).to.be.revertedWith("Target user does not exist");
    });
  });

  describe("Batch Matching", function () {
    beforeEach(function () {
      if (!hre.cofhe.isPermittedEnvironment("MOCK")) this.skip();
    });

    it("Should process batch matches efficiently", async function () {
      const { blindMatch, mockOracle, alice, bob, charlie } = await loadFixture(deployBlindMatchFixture);

      // Initialize FHE for all users
      const initializeResultAlice = await hre.cofhe.initializeWithHardhatSigner(alice);
      const initializeResultBob = await hre.cofhe.initializeWithHardhatSigner(bob);
      const initializeResultCharlie = await hre.cofhe.initializeWithHardhatSigner(charlie);
      await hre.cofhe.expectResultSuccess(initializeResultAlice);
      await hre.cofhe.expectResultSuccess(initializeResultBob);
      await hre.cofhe.expectResultSuccess(initializeResultCharlie);

      // Create profiles for all users
      const encryptResult = await cofhejs.encrypt([Encryptable.uint32(0b1111111111111111n)] as const);
      const [encryptedInterests] = await hre.cofhe.expectResultSuccess(encryptResult);

      await blindMatch.connect(alice).submitProfile(encryptedInterests);
      await blindMatch.connect(bob).submitProfile(encryptedInterests);
      await blindMatch.connect(charlie).submitProfile(encryptedInterests);

      // Wait for profiles to be registered
      await hre.network.provider.send("evm_mine");

      // Batch match alice with bob and charlie
      const targets = [await bob.getAddress(), await charlie.getAddress()];
      const tx = await blindMatch.connect(alice).batchCalculateAndMatch(targets);
      const receipt = await tx.wait();

      // Get addresses before filtering
      const aliceAddress = (await alice.getAddress()).toLowerCase();

      // Verify batch match events
      const matchRequestedEvents = receipt?.logs.filter(
        (log: Log & { fragment?: { name: string } }) =>
          log.fragment?.name === "MatchRequested" && log.topics[1].toLowerCase() === aliceAddress,
      );

      if (!matchRequestedEvents || matchRequestedEvents.length !== 2) {
        throw new Error("Expected 2 MatchRequested events");
      }

      // Simulate oracle callbacks for both matches
      for (const event of matchRequestedEvents) {
        const requestId = event.topics[3];
        await mockOracle.simulateDecryptionCallback(
          await blindMatch.getAddress(),
          requestId,
          true, // isMatch
        );
      }

      // Verify matches were recorded
      const matches = await blindMatch.connect(alice).getMyMatches();
      if (!matches.includes(await bob.getAddress())) throw new Error("Bob match not recorded");
      if (!matches.includes(await charlie.getAddress())) throw new Error("Charlie match not recorded");
    });
  });

  describe("Profile Deletion", function () {
    beforeEach(function () {
      if (!hre.cofhe.isPermittedEnvironment("MOCK")) this.skip();
    });

    it("Should allow users to delete their profiles", async function () {
      const { blindMatch, alice } = await loadFixture(deployBlindMatchFixture);

      // Initialize FHE and create profile
      const initializeResult = await hre.cofhe.initializeWithHardhatSigner(alice);
      await hre.cofhe.expectResultSuccess(initializeResult);

      const encryptResult = await cofhejs.encrypt([Encryptable.uint32(1n)] as const);
      const [encryptedInterests] = await hre.cofhe.expectResultSuccess(encryptResult);
      await blindMatch.connect(alice).submitProfile(encryptedInterests);

      // Delete profile
      await blindMatch.connect(alice).deleteProfile();

      // Verify profile is deleted
      const hasProfile = await blindMatch.hasProfile(await alice.getAddress());
      const totalUsers = await blindMatch.getTotalUsers();
      if (hasProfile) throw new Error("Profile still exists");
      if (Number(totalUsers) !== 0) throw new Error("Total users not zero");
    });
  });
});
