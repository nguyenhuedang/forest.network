const lotion = require('lotion');
// Enhance lotion
require('./lib/fork_lotion');
const { UnsignedTransaction, Transaction } = require('./lib/transaction');
const { CreateAccount, Payment } = require('./lib/operation');
const { Keypair } = require('stellar-base');
const path = require('path');
const crypto = require('crypto');

const app = lotion({
  initialState: {
    // Default account
    accounts: {
      [process.env.GENESIS_ADDRESS]: {
        balance: Number.MAX_SAFE_INTEGER,
        sequence: 0,
      },
    },
  },
  logTendermint: process.env.SHOW_TENDERMINT_LOG === '1',
  rpcPort: 26657,
  abciPort: 26658,
  p2pPort: 26656,
});

// Overwrite tendermint home
app.home = path.join(__dirname, 'tendermint');

app.use(function (state, tx) {
  const hash = crypto.createHash('sha256')
    .update(Transaction.encode(tx))
    .digest()
    .slice(0, 20)
    .toString('hex')
    .toUpperCase();

  // Account
  const account = state.accounts[tx.account];
  if (!account) {
    throw Error('Account does not exist.');
  }

  // Sequence
  if (tx.sequence !== account.sequence + 1) {
    throw Error('Sequence does not match.');
  }

  // Memo
  if (tx.memo.length > 32) {
    throw Error('Memo has more than 32 characters.');
  }

  // Signature
  const key = Keypair.fromPublicKey(tx.account);
  // Hash for sign
  const unsignedHash = crypto
    .createHash('sha256')
    .update(UnsignedTransaction.encode(tx))
    .digest();
  if (!key.verify(unsignedHash, tx.signature)) {
    throw Error('Signature can not be verified.');
  }

  // Operation: create account, payment, post, comment (?), like
  if (tx.operation === 'create_account') {
    const { address } = CreateAccount.decode(tx.params);
    // Check the key
    Keypair.fromPublicKey(address);
    const found = state.accounts[address];
    if (found) {
      throw Error('Account address existed.');
    }
    const newAccount = {
      balance: 0,
      sequence: 0,
    };
    state.accounts[address] = newAccount;
  } else if (tx.operation === 'payment') {
    const { address, amount } = Payment.decode(tx.params);
    if (address === tx.account) {
      throw Error('Cannot transfer to the same address');
    }
    if (amount <= 0) {
      throw Error('Amount must be greater than 0');
    }
    if (amount > account.balance) {
      throw Error('Amount must be less or equal to source balance');
    }
    const found = state.accounts[address];
    if (!found) {
      throw Error('Account address does not exist.');
    }
    account.balance -= amount;
    found.balance += amount;
  } else {
    throw Error('Operation is not support.');
  }
});

app.start()
  .then(({ GCI }) => {
    console.log('forest.network has been starting...');
    console.log('GCI:', GCI);
  })
  .catch(console.error);
