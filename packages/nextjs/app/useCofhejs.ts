import { useCallback, useMemo } from "react";
import { useEffect } from "react";
import { PermitOptions, cofhejs, permitStore } from "cofhejs/web";
import { PublicClient, WalletClient, createWalletClient, http } from "viem";
import { PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { create, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import scaffoldConfig from "~~/scaffold.config";
import { logBlockMessage, logBlockMessageAndEnd, logBlockStart } from "~~/utils/cofhe/logging";
import { notification } from "~~/utils/scaffold-eth";

const ChainEnvironments = {
  // Ethereum
  [chains.mainnet.id]: "MAINNET",
  // Arbitrum
  [chains.arbitrum.id]: "MAINNET",
  // Ethereum Sepolia
  [chains.sepolia.id]: "TESTNET",
  // Arbitrum Sepolia
  [chains.arbitrumSepolia.id]: "TESTNET",
  // Hardhat
  [chains.hardhat.id]: "MOCK",
} as const;

// ZKV SIGNER

const zkvSignerPrivateKey = "0x6C8D7F768A6BB4AAFE85E8A2F5A9680355239C7E14646ED62B044E39DE154512";
function createWalletClientFromPrivateKey(publicClient: PublicClient, privateKey: `0x${string}`): WalletClient {
  const account: PrivateKeyAccount = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(publicClient.transport.url),
  });
}

// COFHEJS

/**
 * Hook to check if the currently connected chain is supported by the application
 * @returns boolean indicating if the current chain is in the target networks list
 * Refreshes when chainId changes
 */
export const useIsConnectedChainSupported = () => {
  const { chainId } = useAccount();
  return useMemo(
    () => scaffoldConfig.targetNetworks.some((network: chains.Chain) => network.id === chainId),
    [chainId],
  );
};

/**
 * Hook to initialize cofhejs with the connected wallet and chain configuration
 * Handles initialization errors and displays toast notifications on success or error
 * Refreshes when connected wallet or chain changes
 */
export function useInitializeCofhejs() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const isChainSupported = useIsConnectedChainSupported();

  const handleError = (error: string) => {
    console.error("cofhejs initialization error:", error);
    notification.error(`cofhejs initialization error: ${error}`);
  };

  useEffect(() => {
    const initializeCofhejs = async () => {
      // Early exit if any of the required dependencies are missing
      if (!publicClient || !walletClient || !isChainSupported) return;

      logBlockStart("useInitializeCofhejs");
      logBlockMessage("INITIALIZING     | Setting up CoFHE environment");

      const chainId = publicClient?.chain.id;
      const environment = ChainEnvironments[chainId as keyof typeof ChainEnvironments] ?? "TESTNET";

      const viemZkvSigner = createWalletClientFromPrivateKey(publicClient, zkvSignerPrivateKey);

      try {
        const initializationResult = await cofhejs.initializeWithViem({
          viemClient: publicClient,
          viemWalletClient: walletClient,
          environment,
          // Whether to generate a permit for the connected account during the initialization process
          // Recommended to set to false, and then call `cofhejs.generatePermit()` when the user is ready to generate a permit
          // !! if **true** - will generate a permit immediately on page load !!
          generatePermit: false,
          // Hard coded signer for submitting encrypted inputs
          // This is only used in the mock environment to submit the mock encrypted inputs so that they can be used in FHE ops.
          // This has no effect in the mainnet or testnet environments.
          mockConfig: {
            decryptDelay: 1000,
            zkvSigner: viemZkvSigner,
          },
        });

        if (initializationResult.success) {
          logBlockMessageAndEnd("SUCCESS          | CoFHE environment initialized");
          notification.success("Cofhejs initialized successfully");
        } else {
          logBlockMessageAndEnd(
            `FAILED           | ${initializationResult.error.message ?? String(initializationResult.error)}`,
          );
          handleError(initializationResult.error.message ?? String(initializationResult.error));
        }
      } catch (err) {
        logBlockMessageAndEnd(`FAILED           | ${err instanceof Error ? err.message : "Unknown error"}`);
        handleError(err instanceof Error ? err.message : "Unknown error initializing cofhejs");
      }
    };

    initializeCofhejs();
  }, [walletClient, publicClient, isChainSupported]);
}

type CofhejsStoreState = ReturnType<typeof cofhejs.store.getState>;

/**
 * Hook to access the cofhejs store state (used internally)
 * @param selector Function to select specific state from the store
 * @returns Selected state from the cofhejs store
 */
const useCofhejsStore = <T>(selector: (state: CofhejsStoreState) => T) => useStore(cofhejs.store, selector);

/**
 * Hook to get the current account initialized in cofhejs
 * @returns The current account address or undefined
 */
export const useCofhejsAccount = () => {
  return useCofhejsStore(state => state.account);
};

/**
 * Hook to get the current chain ID initialized in cofhejs
 * @returns The current chain ID or undefined
 */
export const useCofhejsChainId = () => {
  return useCofhejsStore(state => state.chainId);
};

/**
 * Hook to check if cofhejs is fully initialized (FHE keys, provider, and signer)
 * This is used to determine if the user is ready to use the FHE library
 * FHE based interactions (encrypt / decrypt) should be disabled until this is true
 * @returns boolean indicating if FHE keys, provider, and signer are all initialized
 */
export const useCofhejsInitialized = () => {
  return useCofhejsStore(state => state.fheKeysInitialized && state.providerInitialized && state.signerInitialized);
};

/**
 * Hook to get the complete status of cofhejs
 * @returns Object containing chainId, account, and initialization status
 * Refreshes when any of the underlying values change
 */
export const useCofhejsStatus = () => {
  const chainId = useCofhejsChainId();
  const account = useCofhejsAccount();
  const initialized = useCofhejsInitialized();

  return useMemo(() => ({ chainId, account, initialized }), [chainId, account, initialized]);
};

// Permit Modal

interface CofhejsPermitModalStore {
  generatePermitModalOpen: boolean;
  generatePermitModalCallback?: () => void;
  setGeneratePermitModalOpen: (open: boolean, callback?: () => void) => void;
}

/**
 * Hook to access the permit modal store
 * @returns Object containing modal state and control functions
 */
export const useCofhejsModalStore = create<CofhejsPermitModalStore>(set => ({
  generatePermitModalOpen: false,
  setGeneratePermitModalOpen: (open, callback) =>
    set({ generatePermitModalOpen: open, generatePermitModalCallback: callback }),
}));

// Permits

type PermitStoreState = ReturnType<typeof permitStore.store.getState>;

/**
 * Hook to access the permit store state (used internally)
 * @param selector Function to select specific state from the permit store
 * @returns Selected state from the permit store
 */
const useCofhejsPermitStore = <T>(selector: (state: PermitStoreState) => T) => {
  return useStore(permitStore.store, selector);
};

/**
 * Hook to get the active permit hash for the current chain and account
 * @returns The active permit hash or undefined if not set
 * Refreshes when chainId, account, or initialization status changes
 */
export const useCofhejsActivePermitHash = () => {
  const { chainId, account, initialized } = useCofhejsStatus();
  return useCofhejsPermitStore(state => {
    if (!initialized || !chainId || !account) return undefined;
    return state.activePermitHash?.[chainId]?.[account];
  });
};

/**
 * Hook to get the active permit object
 * @returns The active permit object or null if not found/valid
 * Refreshes when active permit hash changes
 */
export const useCofhejsActivePermit = () => {
  const activePermitHash = useCofhejsActivePermitHash();
  return useMemo(() => {
    const permitResult = cofhejs.getPermit(activePermitHash ?? undefined);
    if (!permitResult) return null;
    if (permitResult.success) {
      return permitResult.data;
    } else {
      return null;
    }
  }, [activePermitHash]);
};

/**
 * Hook to check if the active permit is valid
 * @returns boolean indicating if the active permit is valid
 * Refreshes when permit changes
 */
export const useCofhejsIsActivePermitValid = () => {
  const permit = useCofhejsActivePermit();
  return useMemo(() => {
    if (!permit) return false;
    return permit.isValid();
  }, [permit]);
};

/**
 * Hook to get all permit hashes for the current chain and account
 * @returns Array of permit hashes
 * Refreshes when chainId, account, or initialization status changes
 */
export const useCofhejsAllPermitHashes = () => {
  const { chainId, account, initialized } = useCofhejsStatus();
  return useCofhejsPermitStore(
    useShallow(state => {
      if (!initialized || !chainId || !account) return [];
      return (
        Object.entries(state.permits?.[chainId]?.[account] ?? {})
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .filter(([_, permit]) => permit !== undefined)
          .map(([hash]) => hash)
      );
    }),
  );
};

/**
 * Hook to get all permit objects for the current chain and account
 * @returns Array of permit objects
 * Refreshes when permit hashes change
 */
export const useCofhejsAllPermits = () => {
  const permitHashes = useCofhejsAllPermitHashes();
  return useMemo(() => {
    return permitHashes.map(hash => cofhejs.getPermit(hash));
  }, [permitHashes]);
};

/**
 * Hook to create a new permit
 * @returns Async function to create a permit with optional options
 * Refreshes when chainId, account, or initialization status changes
 */
export const useCofhejsCreatePermit = () => {
  const { chainId, account, initialized } = useCofhejsStatus();
  return useCallback(
    async (permit?: PermitOptions) => {
      if (!initialized || !chainId || !account) return;
      const permitResult = await cofhejs.createPermit(permit);
      if (permitResult.success) {
        notification.success("Permit created");
      } else {
        notification.error(permitResult.error.message ?? String(permitResult.error));
      }
      return permitResult;
    },
    [chainId, account, initialized],
  );
};

/**
 * Hook to remove a permit
 * @returns Async function to remove a permit by its hash
 * Refreshes when chainId, account, or initialization status changes
 */
export const useCofhejsRemovePermit = () => {
  const { chainId, account, initialized } = useCofhejsStatus();
  return useCallback(
    async (permitHash: string) => {
      if (!initialized || !chainId || !account) return;
      permitStore.removePermit(chainId, account, permitHash);
      notification.success("Permit removed");
    },
    [chainId, account, initialized],
  );
};

/**
 * Hook to select the active permit
 * @returns Async function to set the active permit by its hash
 * Refreshes when chainId, account, or initialization status changes
 */
export const useCofhejsSetActivePermit = () => {
  const { chainId, account, initialized } = useCofhejsStatus();
  return useCallback(
    async (permitHash: string) => {
      if (!initialized || !chainId || !account) return;
      permitStore.setActivePermitHash(chainId, account, permitHash);
      notification.success("Active permit updated");
    },
    [chainId, account, initialized],
  );
};

/**
 * Hook to get the issuer of the active permit
 * @returns The permit issuer address or null if no active permit
 * Refreshes when active permit changes
 */
export const useCofhejsPermitIssuer = () => {
  const permit = useCofhejsActivePermit();
  return useMemo(() => {
    if (!permit) return null;
    return permit.issuer;
  }, [permit]);
};
