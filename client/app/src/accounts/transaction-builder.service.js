;(function () {
  'use strict'

  angular.module('arkclient.accounts')
    .service('transactionBuilderService', ['$timeout', '$q', 'networkService', 'accountService', 'ledgerService', 'gettextCatalog', 'utilityService', TransactionBuilderService])

  function TransactionBuilderService ($timeout, $q, networkService, accountService, ledgerService, gettextCatalog, utilityService) {
    const ark = require(require('path').resolve(__dirname, '../node_modules/arkjs'))

    function createTransaction (deferred, config, fee, createTransactionFunc, setAdditionalTransactionPropsOnLedger) {
      let transaction
      try {
        transaction = createTransactionFunc(config)
      } catch (e) {
        deferred.reject(e)
        return
      }

      transaction.fee = fee
      transaction.senderId = config.fromAddress

      if (config.ledger) {
        delete transaction.signature
        transaction.senderPublicKey = config.publicKey
        if (setAdditionalTransactionPropsOnLedger) {
          setAdditionalTransactionPropsOnLedger(transaction)
        }
        ledgerService.signTransaction(config.ledger, transaction)
          .then(({ signature }) => {
            transaction.signature = signature
            transaction.id = ark.crypto.getId(transaction)
            deferred.resolve(transaction)
          })
          .catch(error => {
            console.error(error)
            deferred.reject(error)
          })

        return
      }

      if (ark.crypto.getAddress(transaction.senderPublicKey, networkService.getNetwork().version) !== config.fromAddress) {
        deferred.reject(gettextCatalog.getString('Passphrase is not corresponding to account \'{{ address }}\'', {address: config.fromAddress}))
        return
      }

      deferred.resolve(transaction)
    }

    function prepareTransaction (config, prepareFunc) {
      const deferred = $q.defer()
      const account = accountService.getAccount(config.fromAddress)
      accountService.getFees(false).then((fees) => {
        prepareFunc(deferred, account, fees)
      })
      return deferred.promise
    }

    function createSendTransaction (config) {
      return prepareTransaction(config, (deferred, account, fees) => {
        if (!accountService.isValidAddress(config.toAddress)) {
          deferred.reject(gettextCatalog.getString('The destination address \'{{ address }}\' is erroneous', {address: config.toAddress}))
          return
        }

        if (config.fee > fees.send.maxFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is greater than the maximum required!'))
          return
        }

        if (config.fee < fees.send.minFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is less than the minimum required!'))
          return
        }

        if (config.amount + config.fee > account.balance) {
          deferred.reject(gettextCatalog.getString('Not enough {{ currency }} on your account \'{{ address }}\'!', {currency: networkService.getNetwork().token, address: config.fromAddress}))
          return
        }

        createTransaction(deferred,
                          config,
                          config.fee,
                          () => ark.transaction.createTransaction(config.toAddress,
                                                                  config.amount,
                                                                  config.smartbridge,
                                                                  config.masterpassphrase,
                                                                  config.secondpassphrase,
                                                                  undefined,
                                                                  config.fee))
      })
    }

    /**
     * Each transaction is expected to be `{ address, amount, smartbridge }`,
     * where amount is expected to be in arktoshi
     */
    function createMultipleSendTransactions ({ publicKey, fromAddress, transactions, masterpassphrase, secondpassphrase, ledger }) {
      const network = networkService.getNetwork()
      const account = accountService.getAccount(fromAddress)

      return new Promise((resolve, reject) => {
        accountService.getFees(false).then(fees => {
          const invalidAddress = transactions.find(t => {
            return !ark.crypto.validateAddress(t.address, network.version)
          })

          if (invalidAddress) {
            return reject(new Error(gettextCatalog.getString('The destination address \'{{ address }}\' is erroneous', {address: invalidAddress})))
          }

          const total = transactions.reduce((total, t) => total + t.amount + fees.send, 0)
          if (total > account.balance) {
            return reject(new Error(gettextCatalog.getString(
              'Not enough {{ currency }} on your account \'{{ address }}\' you need at least {{ amount }} to send your transactions!',
            {
              currency: network.token,
              address: fromAddress,
              amount: total
            })))
          }

          const processed = Promise.all(
            transactions.map(({ address, amount, smartbridge }, i) => {
              return new Promise((resolve, reject) => {
                const transaction = ark.transaction.createTransaction(address, amount, smartbridge, masterpassphrase, secondpassphrase, undefined, fees.send)

                transaction.fee = fees.send
                transaction.senderId = fromAddress

                if (ledger) {
                  $timeout(transaction => {
                    delete transaction.signature
                    transaction.senderPublicKey = publicKey

                    // Wait a little just in case
                    ledgerService.signTransaction(ledger, transaction)
                      .then(({ signature }) => {
                        transaction.signature = signature
                        transaction.id = ark.crypto.getId(transaction)
                        resolve(transaction)
                      })
                      .catch(error => {
                        console.error(error)
                        reject(error)
                      })
                  }, 2000 * i, true, transaction)
                } else {
                  if (ark.crypto.getAddress(transaction.senderPublicKey, network.version) !== fromAddress) {
                    return reject(new Error(gettextCatalog.getString('Passphrase is not corresponding to account \'{{ address }}\'', {address: fromAddress})))
                  }

                  resolve(transaction)
                }
              })
            })
          )

          processed
            .then(resolve)
            .catch(reject)
        })
      })
    }

    function createSecondPassphraseCreationTransaction (config) {
      return prepareTransaction(config, (deferred, account, fees) => {
        if (config.fee > fees.secondsignature.maxFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is greater than the maximum required!'))
          return
        }

        if (config.fee < fees.secondsignature.minFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is less than the minimum required!'))
          return
        }

        if (account.balance < config.fee) {
          deferred.reject(gettextCatalog.getString(
              'Not enough {{ currency }} on your account \'{{ address }}\' you need at least {{ amount }} to create a second passphrase!',
              {
                currency: networkService.getNetwork().token,
                address: config.fromAddress,
                amount: arktoshiToArk(config.fee)
              }
          ))
          return
        }

        createTransaction(deferred,
                          config,
                          config.fee,
                          () => ark.signature.createSignature(config.masterpassphrase, config.secondpassphrase, config.fee))
      })
    }

    function createDelegateCreationTransaction (config) {
      return prepareTransaction(config, (deferred, account, fees) => {
        if (config.fee > fees.delegate.maxFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is greater than the maximum required!'))
          return
        }

        if (config.fee < fees.delegate.minFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is less than the minimum required!'))
          return
        }

        if (account.balance < config.fee) {
          deferred.reject(gettextCatalog.getString(
            'Not enough {{ currency }} on your account \'{{ address }}\' you need at least {{ amount }} to register delegate!',
            {
              currency: networkService.getNetwork().token,
              address: config.fromAddress,
              amount: arktoshiToArk(config.fee)
            }
          ))
          return
        }

        createTransaction(deferred,
                          config,
                          config.fee,
                          () => ark.delegate.createDelegate(config.masterpassphrase, config.username, config.secondpassphrase, config.fee))
      })
    }

    function createVoteTransaction (config) {
      return prepareTransaction(config, (deferred, account, fees) => {
        if (config.fee > fees.vote.maxFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is greater than the maximum required!'))
          return
        }

        if (config.fee < fees.vote.minFee) {
          deferred.reject(gettextCatalog.getString('The fee chosen is less than the minimum required!'))
          return
        }

        if (account.balance < config.fee) {
          deferred.reject(gettextCatalog.getString(
            'Not enough {{ currency }} on your account \'{{ address }}\' you need at least {{ amount }} to vote!',
            {
              currency: networkService.getNetwork().token,
              address: config.fromAddress,
              amount: arktoshiToArk(config.fee)
            }
          ))
          return
        }

        createTransaction(deferred,
                          config,
                          config.fee,
                          () => ark.vote.createVote(config.masterpassphrase, config.publicKeys.split(','), config.secondpassphrase, config.fee),
                          (transaction) => { transaction.recipientId = config.fromAddress })
      })
    }

    function arktoshiToArk (value) {
      return utilityService.arktoshiToArk(value) + ' ' + networkService.getNetwork().token
    }

    return {
      createSendTransaction,
      createMultipleSendTransactions,
      createSecondPassphraseCreationTransaction,
      createDelegateCreationTransaction,
      createVoteTransaction
    }
  }
})()
