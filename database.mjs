/****************************************************** 
 *                    Database                        *
 * This file includes code that implements basic      *
 * databased functionality for the Connect Acount,    *
 * Create Transaction, and Refund Transaction         *
 * endpoints.                                         *
 ******************************************************/

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Client = require("@replit/database");
const client = new Client(process.env.REPLIT_DB_URL);
import { v4 as uuidv4 } from 'uuid';

/** **************************************** */
// Support for the Connect Account endpoint //
/** ************************************** */
/*
DB schema:
"merchants" : {
  "setupId" : {
    "accountId" : string,
    "accountName" : string,
    "wixMerchantId" : string
}
*/
export async function createAccount (accountDetails) {
  // Validate account data. In this example, the currency
  // and account details are validated.
  
  // Check that currency is EUR
  if(accountDetails.currency != "EUR"){
    throw new Error("CURRENCY_NOT_SUPPORTED")
  }
  // Check that account details are provided
  if(!accountDetails.credentials.setupId||!accountDetails.credentials.email){
    throw new Error("INVALID_ACCOUNT_DETAILS")
  }

  const merchants = await client.get("merchants");
  // If the merchant doesn't exist yet, create a new one.
  if(!merchants.hasOwnProperty(accountDetails.credentials.setupId)){
    const newMerchant = {
      "accountId" : uuidv4(),
      "accountName" : accountDetails.credentials.email,
      "wixMerchantId" : accountDetails.wixMerchantId
    }
    merchants[accountDetails.credentials.setupId] = newMerchant
    await client.set("merchants", merchants);
    return newMerchant;
  // If the merchant already exists, return the details.
  } else {
    return merchants[accountDetails.credentials.setupId]
  }
  
}

/** ******************************************* */
// Support for the Create Transaction endpoint //
/** ***************************************** */
/*
DB schema:
"transactions" : {
  "wixTransactionId" : {
    "internalTransactionId" : string,
    "amount" : int,
    "currency" : string (must be EUR)
    "status" : enum ["APPROVED", "DECLINED", "PENDING"],
    "wixMerchantId" : string
}
*/
export async function processWixTransaction (transactionDetails) {
  // Validate transaction data. In this example, the currency,
  // payment method, and merchant ID are validated.
  
  // Validate currency
  if(transactionDetails.order.description.currency != "EUR"){
    throw new Error("CURRENCY_NOT_SUPPORTED")
  }
  // Validate that the method is credit card
  if(transactionDetails.paymentMethod != 'creditCard'){
    throw new Error("PAYMENT_TYPE_NOT_SUPPORTED")
  }

  // Check that the wixMerchantId is valid
  let merchantIdExists = false;
  const merchants = await client.get('merchants');
  const merchantList = Object.keys(merchants)
  for (const merchant of merchantList) {
    if(merchants[merchant]['wixMerchantId'] === transactionDetails.wixMerchantId){
      merchantIdExists = true;
    }
  }
  if (merchantIdExists === false){
    throw new Error("INVALID_ACCOUNT")
  }

  // Read existing transactions from DB
  const transactions = await client.get('transactions')
  // Check if the transaction already exists
  if (transactions.hasOwnProperty(transactionDetails.wixTransactionId)) {
    return transactions[transactionDetails.wixTransactionId] 
  
  // If the transaction is new, create it.
  } else {
    // This code chooses a transaction result randomly. Implement
    // your own payment processing here.
    const results = ["APPROVED", "DECLINED", "PENDING"]
    const result = results[Math.floor(Math.random() * results.length)]

    // Create and store the new transaction
    const newTransaction = {
      internalTransactionId : uuidv4(),
      amount : transactionDetails.order.description.totalAmount,
      currency : transactionDetails.order.description.currency,
      status: result,
      //status : result,
      wixMerchantId : transactionDetails.wixMerchantId
    }
    transactions[transactionDetails.wixTransactionId] = newTransaction;
    await client.set('transactions', transactions);
    return newTransaction;
  } 
}

/** ******************************************* */
// Support for the Refund Transaction endpoint //
/** ***************************************** */

// There is no separate DB object for refunds. 
// Instead, this function adds `refundId` and 
// `refundedAmount` fields to an existing transaction
// object.

export async function processWixRefund (refundDetails) {
  // Fetch the transactions object
  const transactions = await client.get('transactions');

  // Validate that the transaction exists
  if(transactions[refundDetails.wixTransactionId] === undefined) {
    throw new Error("TRANSACTION_NOT_FOUND")
  }

  // Save the refunded amount and create a refund ID if needed.
  let refundTransaction = transactions[refundDetails.wixTransactionId]
  
  if(refundTransaction.refundedAmount === undefined){refundTransaction.refundedAmount = 0}
  refundTransaction.refundedAmount += refundDetails.refundAmount;

  if(refundTransaction.refundId === undefined) {
    refundTransaction.refundId = uuidv4()
  }

  transactions[refundDetails.wixTransactionId] = refundTransaction;
  await client.set('transactions', transactions)

  // Return the internal refund ID for the response to Wix.
  return refundTransaction.refundId;
}