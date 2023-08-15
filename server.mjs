/****************************************************** 
 *                     Server                         *
 * This file includes code that implements a server   *
 * with the endpoints for a Payment Provider service. *
 ******************************************************/

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const express = require('express');
const path = require('path');
import {jwtProcessing} from './jwt-validation.mjs';
import {createAccount, processWixTransaction, processWixRefund} from './database.mjs'
import {submitEvent} from './submit-event.mjs'

const app = express();
app.use(express.json())
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.send('Martini Payments Provider')
});

// Connect account endpoint //
app.post('/connect', async (req, res) => {

  // Validate JWT
  try{
    const jwtIsValid = jwtProcessing(req.get('Digest').replace('JWT=', ''), JSON.stringify(req.body))
    if (!jwtIsValid){
      res.status(400).send("Invalid request")
      return;
    }
  } catch (error) {
    res.status(400).send("Invalid Request")
    return;
  }
  
  // Process the request data
  try {
    const accountDetails = await createAccount(req.body)
    res.send({
      credentials : {
        merchantId : accountDetails.accountId,
        ...req.body.credentials
      },
      accountId : accountDetails.accountId,
      accountName : accountDetails.accountName
    })

    // Handle errors
  } catch (error) {
    if (error.message === "CURRENCY_NOT_SUPPORTED") {
      res.send({
          reasonCode: 2009,
          errorCode: "CURRENCY_IS_NOT_SUPPORTED",
          errorMessage: "Only EUR is supported"
      })
    } else if (error.message === "INVALID_ACCOUNT_DETAILS") {
      res.send({
          reasonCode: 2002,
          errorCode: "INVALID_ACCOUNT_DETAILS",
          errorMessage: "Provide setup ID and email"
      })
    }
  }
  
})

// Create transaction endpoint //
app.post('/transaction', async (req, res) => {

  // Validate JWT
  try{
    const jwtIsValid = jwtProcessing(req.get('Digest').replace('JWT=', ''), JSON.stringify(req.body))
    if (!jwtIsValid){
      res.status(400).send("Invalid request")
      return;
    }
  } catch (error) {
    res.status(400).send("Invalid Request")
    return;
  }

  // Handle the transaction
  try {
    // Process the transaction in the database
    const transactionResults = await processWixTransaction(req.body)

    // Deal with different payment statuses:

    // Payment approved
    if (transactionResults.status === "APPROVED") {
      const response = {
        pluginTransactionId : transactionResults.internalTransactionId
      }
      res.send(response);
      submitEvent({
        event: {
          transaction : {
            ...response,
            wixTransactionId : req.body.wixTransactionId
          }
        }
      })
      
    // Payment declined
    } else if (transactionResults.status === "DECLINED") {
        const response = {
          pluginTransactionId : transactionResults.internalTransactionId,
          reasonCode : 3019,
          errorCode: "CARD_LIMIT_EXCEEDED",
          errorMessage: "Not enough funds left in the card limit for this transaction."
        }
        res.send(response)
        await submitEvent({
          event: {
            transaction : {
              ...response,
              wixTransactionId : req.body.wixTransactionId
            }
          }
        })
      
    // Payment pending
    } else if (transactionResults.status === "PENDING") {
        res.send({
          wixTransactionId: req.body.wixTransactionId,
          pluginTransactionId: transactionResults.internalTransactionId,
          reasonCode: 5005
        })
      // Send a webhook with an updated payment status from somewhere
      // else in your code.
    }

  // Handle errors
  } catch (error) {
    if (error.message === "CURRENCY_NOT_SUPPORTED") {
      res.send({
          reasonCode: 3003,
          errorCode: "CURRENCY_IS_NOT_SUPPORTED",
          errorMessage: "Only EUR is supported"
      })
      await submitEvent({
          event: {
            transaction : {
              wixTransactionId : req.body.wixTransactionId,
              reasonCode: 3003,
              errorCode: "CURRENCY_IS_NOT_SUPPORTED",
              errorMessage: "Only EUR is supported"
            }
          }
        })
    } else if (error.message === "INVALID_ACCOUNT") {
      res.send({
          reasonCode: 3041,
          errorCode: "INVALID_ACCOUNT",
          errorMessage: "Wix Merchant ID not registered wit Martini Payments"
      })
      await submitEvent({
        event: {
          transaction : {
            wixTransactionId : req.body.wixTransactionId,
            reasonCode: 3041,
            errorCode: "INVALID_ACCOUNT",
            errorMessage: "Wix Merchant ID not registered wit Martini Payments"
            }
          }
        })
    } else if (error.message === "PAYMENT_TYPE_NOT_SUPPORTED") {
      res.send({
        reasonCode: 3002,
        errorCode: "PAYMENT_TYPE_NOT_SUPPORTED",
        errorMessage: "Only credit card payments are supported"
      })
      await submitEvent({
        event: {
          transaction : {
            wixTransactionId : req.body.wixTransactionId,
            reasonCode: 3002,
        errorCode: "PAYMENT_TYPE_NOT_SUPPORTED",
        errorMessage: "Only credit card payments are supported"
            }
          }
        })
    }
  }
  
})

// Refund transaction endpoint//
app.post('/refund', async (req, res) => {

  // Validate JWT
  try{
    const jwtIsValid = jwtProcessing(req.get('Digest').replace('JWT=', ''), JSON.stringify(req.body))
    if (!jwtIsValid){
      res.status(400).send("Invalid request")
      return;
    }
  } catch (error) {
    res.status(400).send("Invalid Request")
    return;
  }

  // Handle the refund
  try {
    const refundId = await processWixRefund(req.body)
    res.send({
    'pluginRefundId' : refundId
     })
    await submitEvent({
      event: {
        refund: {
          wixTransactionId: req.body.wixTransactionId,
          wixRefundId : req.body.wixRefundId,
          amount: req.body.refundAmount,
          pluginRefundId : refundId
        }
      }
    })

  // Handle errors  
  } catch (error) {
    if(error.message === "TRANSACTION_NOT_FOUND"){
      res.send({
        reasonCode: 6000,
        errorCode: "TRANSACTION_NOT_FOUND",
        errorMessage: "The transaction you tried to refund wasn't found. Please contact Martini Payments for support."
      })
      await submitEvent({
      event: {
        refund: {
          wixTransactionId: req.body.wixTransactionId,
          wixRefundId : req.body.wixRefundId,
          reasonCode: 6000,
          errorCode: "TRANSACTION_NOT_FOUND",
          errorMessage: "The transaction you tried to refund wasn't found. Please contact Martini Payments for support."
        }
      }
    })
    }
  }

})

app.listen(3000, () => {
  console.log('server started');
});

