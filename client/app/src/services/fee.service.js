;(function () {
  'use strict'

  angular.module('arkclient.services')
    .service('feeService', ['$q', 'networkService', FeeService])

  /**
   * FeeService
   * @constructor
   */
  function FeeService ($q, networkService) {
    const defaultFees = [
      {
        type: 0,
        avg: 10000000,
        maxFee: 10000000,
        minFee: 10000000
      },
      {
        type: 1,
        avg: 500000000,
        max: 500000000,
        min: 500000000
      },
      {
        type: 2,
        avg: 2500000000,
        maxFee: 2500000000,
        minFee: 2500000000
      },
      {
        type: 3,
        avg: 100000000,
        maxFee: 100000000,
        minFee: 100000000
      }
    ]

    let cachedFees = null

    const byType = async type => {
      const data = await getFees()
      return data.find(d => d.type === type)
    }

    const getFees = (canUseCached = false) => {
      const deferred = $q.defer()

      if (canUseCached && cachedFees) {
        deferred.resolve(cachedFees)
      }

      networkService.getFromPeer('/api/loader/autoconfigure')
        .then((resp) => {
          if (resp.success) {
            cachedFees = resp.feeStatistics
            deferred.resolve(cachedFees)
          } else {
            deferred.resolve(defaultFees)
          }
        }, () => deferred.resolve(defaultFees))
    }

    return {
      byType,
      getFees
    }
  }
})()
