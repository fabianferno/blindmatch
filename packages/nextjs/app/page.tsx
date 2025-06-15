"use client";

import { BlindMatchComponent } from "./BlindMatchComponent";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { motion } from "framer-motion";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  return (
    <>
      <div className="flex items-center bg-black flex-col grow pt-10">
        <div className="flex">
          <h1 className="text-[150px] filter contrast-200 saturate-150 brightness-125 -hue-rotate-30">🔒</h1>
          <motion.div
            className="px-5"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-left">
              <motion.span
                className="block text-2xl mb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Welcome to
              </motion.span>
              <motion.span
                className="block text-6xl font-bold mb-2 bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
              >
                BlindMatch
              </motion.span>
            </h1>
            <motion.div
              className="flex justify-start items-start space-x-2 flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <p className="my-2 font-medium">Connected Address:</p>
              <Address address={connectedAddress} />
            </motion.div>
          </motion.div></div>

        <motion.div
          className="grow bg-base-300 w-full px-8 py-12 rounded-lg shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="flex justify-center items-center gap-12 flex-col md:flex-row">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full"
            >
              <BlindMatchComponent />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default Home;
