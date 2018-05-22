;(function () {
  'use strict'

  angular.module('arkclient.services')
    .service('feeService', [FeeService])

  /**
   * FeeService
   * @constructor
   */
  function FeeService () {

    // TODO get real data from autoconfig endpoint
    const data = [
      {
        type: 0,
        max: 1000000,
        min: 0,
        avg: 400000
      }, {
        type: 2,
        max: 1000000,
        min: 0,
        avg: 400000
      }, {
        type: 3,
        max: 1000000,
        min: 0,
        avg: 400000
      }
    ]

    const byType = type => {
      return data.find(d => d.type === type)
    }

    return {
      byType
    }
  }
})()
