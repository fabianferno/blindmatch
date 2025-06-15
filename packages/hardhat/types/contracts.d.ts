import { BaseContract, ContractTransactionResponse, ContractRunner } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export interface BlindMatch extends BaseContract {
  setOracle(oracle: string): Promise<ContractTransactionResponse>;
  submitProfile(encryptedInterests: any): Promise<ContractTransactionResponse>;
  calculateAndMatch(targetUser: string): Promise<ContractTransactionResponse>;
  batchCalculateAndMatch(targets: string[]): Promise<ContractTransactionResponse>;
  getMyMatches(): Promise<string[]>;
  hasProfile(user: string): Promise<boolean>;
  getTotalUsers(): Promise<number>;
  deleteProfile(): Promise<ContractTransactionResponse>;
  connect(signer: HardhatEthersSigner): BlindMatch;
}

export interface MockOracle extends BaseContract {
  simulateDecryptionCallback(target: string, requestId: string, isMatch: boolean): Promise<ContractTransactionResponse>;
  connect(signer: HardhatEthersSigner): MockOracle;
}
