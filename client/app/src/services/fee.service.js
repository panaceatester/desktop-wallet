;(function () {
  'use strict'

  angular.module('arkclient.services')
    .service('feeService', ['$q', 'networkService', 'utilityService', FeeService])

  /**
   * FeeService
   * @constructor
   */
  function FeeService ($q, networkService, utilityService) {
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
      const data = await getFees(true).promise
      const result = await data.find(d => d.type === type)

      return {
        avg: utilityService.arktoshiToArk(result.avg, 0),
        min: utilityService.arktoshiToArk(result.minFee, 0),
        max: utilityService.arktoshiToArk(result.maxFee, 0)
      }
    }

    const getFees = (canUseCached = false) => {
      const deferred = $q.defer()

      if (canUseCached && cachedFees) {
        deferred.resolve(cachedFees)
      }

      networkService.getFromPeer('/api/loader/autoconfigure')
        .then((resp) => {
          if (resp.success && resp.feeStatistics) {
            cachedFees = resp.feeStatistics
            deferred.resolve(cachedFees)
          } else {
            deferred.resolve(defaultFees)
          }
        }, () => deferred.resolve(defaultFees))

      return deferred
    }

    getFees() // call on start

    return {
      byType,
      getFees
    }
  }
})()
