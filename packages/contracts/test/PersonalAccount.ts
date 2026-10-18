import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

const { viem, networkHelpers } = await network.create();
const operation = (label: string) => keccak256(toBytes(label));

describe("PersonalAccount", () => {
  async function fixture() {
    const [owner, delegate, recipient, outsider] = await viem.getWalletClients();
    const factory = await viem.deployContract("PersonalAccountFactory");
    await factory.write.createAccount();
    const address = await factory.read.accountOf([owner.account.address]);
    const account = await viem.getContractAt("PersonalAccount", address);
    const token = await viem.deployContract("MockTestToken");
    await token.write.mint([owner.account.address, 1_000n]);
    await token.write.approve([address, 1_000n]);
    await account.write.deposit([token.address, 1_000n]);
    const action = operation("logo");
    const latest = await (await viem.getPublicClient()).getBlock();
    await account.write.createPolicy([
      delegate.account.address,
      token.address,
      recipient.account.address,
      action,
      100n,
      150n,
      latest.timestamp + 3600n,
    ]);
    return { owner, delegate, recipient, outsider, factory, account, token, action };
  }

  it("creates one distinct account per wallet and retains owner control", async () => {
    const { owner, outsider, factory, account, token } = await networkHelpers.loadFixture(fixture);
    assert.equal((await account.read.owner()).toLowerCase(), owner.account.address.toLowerCase());
    await viem.assertions.revertWith(factory.write.createAccount(), "account exists");
    await viem.assertions.revertWith(
      account.write.transferOwnership([outsider.account.address]),
      "nontransferable account",
    );
    await viem.assertions.revertWith(account.write.renounceOwnership(), "nontransferable account");
    await factory.write.createAccount({ account: outsider.account });
    const other = await factory.read.accountOf([outsider.account.address]);
    assert.notEqual(other, account.address);
    assert.equal(await token.read.balanceOf([other]), 0n);
    await assert.rejects(
      account.write.withdraw([token.address, outsider.account.address, 1n], {
        account: outsider.account,
      }),
      /OwnableUnauthorizedAccount/,
    );
    await account.write.withdraw([token.address, owner.account.address, 20n]);
    assert.equal(await token.read.balanceOf([account.address]), 980n);
  });

  it("pays only the named delegate, token, recipient, action and capped amount", async () => {
    const { delegate, recipient, outsider, account, token, action } =
      await networkHelpers.loadFixture(fixture);
    const quote = operation("quote-1");
    await viem.assertions.revertWith(
      account.write.pay([1n, operation("order-1"), quote, action, 1n], {
        account: outsider.account,
      }),
      "unauthorized",
    );
    await viem.assertions.revertWith(
      account.write.pay([1n, operation("order-1"), quote, action, 101n], {
        account: delegate.account,
      }),
      "limit exceeded",
    );
    await viem.assertions.revertWith(
      account.write.pay([1n, operation("order-1"), quote, operation("other-action"), 1n], {
        account: delegate.account,
      }),
      "invalid commitment",
    );
    await account.write.pay([1n, operation("order-1"), quote, action, 100n], {
      account: delegate.account,
    });
    assert.equal(await token.read.balanceOf([recipient.account.address]), 100n);
    await viem.assertions.revertWith(
      account.write.pay([1n, operation("order-1"), quote, action, 1n], {
        account: delegate.account,
      }),
      "operation used",
    );
    await viem.assertions.revertWith(
      account.write.pay([1n, operation("order-2"), quote, action, 51n], {
        account: delegate.account,
      }),
      "limit exceeded",
    );
    await account.write.pay([1n, operation("order-2"), quote, action, 50n], {
      account: delegate.account,
    });
    assert.equal(await token.read.balanceOf([recipient.account.address]), 150n);
  });

  it("revocation and expiry stop delegated payments without removing withdrawal rights", async () => {
    const { delegate, owner, account, token, action } = await networkHelpers.loadFixture(fixture);
    await account.write.revokePolicy([1n]);
    await viem.assertions.revertWith(
      account.write.pay([1n, operation("order-3"), operation("quote-3"), action, 1n], {
        account: delegate.account,
      }),
      "unauthorized",
    );
    await account.write.withdraw([token.address, owner.account.address, 1_000n]);
    assert.equal(await token.read.balanceOf([owner.account.address]), 1_000n);
  });

  it("rejects payment at the policy expiry boundary", async () => {
    const { delegate, account, action } = await networkHelpers.loadFixture(fixture);
    await networkHelpers.time.increase(3601);
    await viem.assertions.revertWith(
      account.write.pay([1n, operation("expired-order"), operation("expired-quote"), action, 1n], {
        account: delegate.account,
      }),
      "unauthorized",
    );
  });

  it("reserves aggregate capacity across policies and withdrawals", async () => {
    const { owner, delegate, recipient, account, token, action } =
      await networkHelpers.loadFixture(fixture);
    assert.equal(await account.read.reserved([token.address]), 150n);
    await viem.assertions.revertWith(
      account.write.withdraw([token.address, owner.account.address, 851n]),
      "capacity reserved",
    );
    const latest = await (await viem.getPublicClient()).getBlock();
    await viem.assertions.revertWith(
      account.write.createPolicy([
        delegate.account.address,
        token.address,
        recipient.account.address,
        action,
        100n,
        851n,
        latest.timestamp + 3600n,
      ]),
      "insufficient capacity",
    );
    await account.write.pay([1n, operation("order-4"), operation("quote-4"), action, 100n], {
      account: delegate.account,
    });
    assert.equal(await account.read.reserved([token.address]), 50n);
    await account.write.revokePolicy([1n]);
    assert.equal(await account.read.reserved([token.address]), 0n);
    await account.write.withdraw([token.address, owner.account.address, 900n]);
    assert.equal(await token.read.balanceOf([account.address]), 0n);
  });
});
