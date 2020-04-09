const Influx = require('influx')
const config = require('./config')
const Authenticator = require('./authenticate')
const auth = new Authenticator()

const influx = new Influx.InfluxDB({
  host: config.influx.host,
  database: config.influx.db,
  schema: [
    {
      measurement: 'response_times',
      fields: {
        rx: Influx.FieldType.FLOAT,
        tx: Influx.FieldType.FLOAT
      },
      tags: [
        'port'
      ]
    }
  ]
})

function calculateThroughput (oldval, newval, duration) {
  let bytediff = BigInt('0x' + newval) - BigInt('0x' + oldval)
  let durationseconds = duration / 1000

  let megabytes = Number(bytediff) / 1024 / 1024
  let megabytes_persecond = megabytes / durationseconds
  let megabits_persecond = megabytes_persecond * 8

  return megabits_persecond
}

let lastUpdated
let lastResult

async function getSpeeds () {
  return new Promise(async (resolve, reject) => {
      try {
        let result = await auth.getPortStatistics()

        let msdif = 0

        if (lastUpdated) msdif = new Date().getTime() - lastUpdated.getTime()

        let processAll = result.map((port, i) => {
          return new Promise((resolve, reject) => {
            if (!lastUpdated) return resolve()

            let currentrx = port.data.rx.val
            let currenttx = port.data.tx.val

            let beforerx = lastResult[i].data.rx.val
            let beforetx = lastResult[i].data.tx.val

            let rxmbps = calculateThroughput(beforerx, currentrx, msdif)
            let txmbps = calculateThroughput(beforetx, currenttx, msdif)

            resolve(0)

            influx.writePoints([
              {
                measurement: 'response_times',
                tags: { port: config.portNames[i] },
                fields: { rx: rxmbps, tx: txmbps },
              }
            ]).then(() => {
              resolve()
            }).catch(err => {
              console.error(`Error saving data to InfluxDB! ${err.stack}`)
              reject()
            })
          })
        })

        Promise.all(processAll).then(() => {
          lastUpdated = new Date()
          lastResult = result
          resolve()
          console.log(new Date().toISOString() + ` > Ports processed. Duration: ${msdif / 1000} seconds`)
        })
      } catch
        (e) {
        reject(e)
      }
    }
  )
}

function repeatFn () {
  getSpeeds().then(() => {
    setTimeout(() => {
      repeatFn()

    }, config.refreshSeconds * 1000)
  }).catch((e) => {
    console.log(e)
    setTimeout(() => {
      repeatFn()

    }, config.refreshSeconds * 1000)
  })
}

repeatFn()

