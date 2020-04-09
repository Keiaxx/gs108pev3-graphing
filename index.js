const request = require('request')
const cheerio = require('cheerio')
const Influx = require('influx')
const config = require('./config')

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

const headers = {
  'Connection': 'keep-alive',
  'Cache-Control': 'max-age=0',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cookie': config.cookie
};

const options = {
  url: 'http://'+config.switchip+'/port_statistics.htm',
  headers: headers
};

function calculateThroughput(oldval, newval, duration) {
  let bytediff = BigInt('0x' + newval) - BigInt( '0x' + oldval)
  let durationseconds = duration / 1000

  let megabytes = Number(bytediff) / 1024 / 1024
  let megabytes_persecond = megabytes / durationseconds
  let megabits_persecond = megabytes_persecond * 8

  return megabits_persecond
}

let lastUpdated;
let lastResult;

function getSpeeds(done) {
  request(options, (error, response, body) => {
    if (!error && response.statusCode == 200) {
      const $ = cheerio.load(body)
      const result = $(".portID").map((i, element) => ({
        port: i,
        data: {
          rx: {
            val: $(element).find('input[type=hidden]:nth-child(3)').attr('value'),
          },
          tx: {
            val: $(element).find('input[type=hidden]:nth-child(5)').attr('value'),
          }
        }
      })).get()

      let msdif = 0;

      if(lastUpdated) msdif = new Date().getTime() - lastUpdated.getTime();

      let processAll = result.map((port, i) => {
        return new Promise((resolve, reject) => {
          if(!lastUpdated) return resolve()

          let portnum = i;
          let currentrx = port.data.rx.val
          let currenttx = port.data.tx.val

          let beforerx = lastResult[i].data.rx.val
          let beforetx = lastResult[i].data.tx.val

          let rxmbps = calculateThroughput(beforerx, currentrx, msdif)
          let txmbps = calculateThroughput(beforetx, currenttx, msdif)

          resolve(0 )

          influx.writePoints([
            {
              measurement: 'response_times',
              tags: { port: config.portNames[i] },
              fields: { rx: rxmbps, tx: txmbps },
            }
          ]).then(() =>{
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
        done()
        console.log(new Date().toISOString() + ` > Ports processed. Duration: ${msdif/1000} seconds`)
      })
    }
  });
}


function repeatFn() {
  getSpeeds(() => {
    setTimeout(() => {
      repeatFn()
    }, config.refreshSeconds * 1000)
  })
}

repeatFn()

