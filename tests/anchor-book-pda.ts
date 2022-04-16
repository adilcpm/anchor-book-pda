import * as anchor from "@project-serum/anchor";
import { Program, splitArgsAndCtx } from "@project-serum/anchor";
import { AnchorBookPda } from "../target/types/anchor_book_pda";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAccount
} from "@solana/spl-token";
import { expect } from 'chai';

describe("anchor-book-pda", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new anchor.web3.PublicKey('BhfjKSiJtR7dUJU66DYX8QVFqQBaina5u1VcFnRzWLgK');
  const idl = JSON.parse(require('fs').readFileSync('./target/idl/anchor_book_pda.json', 'utf8'));
  const program = new anchor.Program(idl, programId) as Program<AnchorBookPda>;
  const distributorName = "Anchor Book";

  let distributorAccountPda: anchor.web3.PublicKey;
  let tokenMint: anchor.web3.PublicKey;
  let distributorAccountBump: number, tokenMintBump: number;

  it("Initializes the Distributor", async () => {
    let bumps = new PoolBumps();

    function PoolBumps() {
      this.distributorAccount;
      this.tokenMint;
    }

    [distributorAccountPda, distributorAccountBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(distributorName)],
        program.programId
      );
    bumps.distributorAccount = distributorAccountBump;

    [tokenMint, tokenMintBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(distributorName), Buffer.from("token_mint")],
        program.programId
      );
    bumps.tokenMint = tokenMintBump;

    try {
      await program.account.distributorAccount.fetch(distributorAccountPda);
    }
    catch (e) {
      await program.methods
        .initializeDistributor(distributorName, bumps)
        .accounts({
          distributorCreator: provider.wallet.publicKey,
          distributorAccount: distributorAccountPda,
          tokenMint: tokenMint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    }

    let distributorAccount = await program.account.distributorAccount.fetch(distributorAccountPda);
    expect(distributorAccount.creatorAuthority.toString()).to.equal(provider.wallet.publicKey.toString());
    expect(distributorAccount.isInitialized).to.equal(true);

  });

  it("Get Tokens from Distributor", async () => {
    let amount = new anchor.BN(100)

    let userTokenAccount = await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, tokenMint, provider.wallet.publicKey);
    let beforeAmountUser = Number(userTokenAccount.amount);
    let distributorAccount = await program.account.distributorAccount.fetch(distributorAccountPda);
    let beforeSupplyAmount = distributorAccount.tokenSupply;
    await program.methods
      .getToken(amount)
      .accounts({
        distributorAccount: distributorAccountPda,
        tokenMint: tokenMint,
        userTokenAccount: userTokenAccount.address,
        user: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    userTokenAccount = await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, tokenMint, provider.wallet.publicKey);
    let afterAmountUser = Number(userTokenAccount.amount);
    distributorAccount = await program.account.distributorAccount.fetch(distributorAccountPda);
    let afterSupplyAmount = distributorAccount.tokenSupply;

    expect(beforeAmountUser + amount.toNumber()).to.equal(afterAmountUser);
    expect(beforeSupplyAmount.add(amount).toNumber()).to.equal(afterSupplyAmount.toNumber());
  });
});
