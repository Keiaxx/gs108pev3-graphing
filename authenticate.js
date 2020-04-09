const request = require('request')
const config = require('./config')
const cheerio = require('cheerio')
const jsonfile = require('jsonfile')
const file = './cookie.json'

const maxSessionTime = 30 * 60 * 1000 // 30 minutes

const loginOptions = (password) => ({
  url: 'http://'+config.switchip+'/login.cgi',
  method: 'POST',
  headers: {
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0',
    'Origin': 'http://'+config.switchip,
    'Upgrade-Insecure-Requests': '1',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Referer': 'http://192.168.86.94/login.htm',
    'Accept-Language': 'en-US,en;q=0.9'
  },
  body: 'password=' + password
})

let logoutRequest = (cookie) => ({
  url: 'http://'+config.switchip+'/logout.cgi',
  headers: {
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Referer': 'http://'+config.switchip+'/index.htm',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': cookie
  }
})

let portStatisticsRequest =  (cookie) => ({
  url: 'http://'+config.switchip+'/port_statistics.htm',
  headers: {
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': cookie
  }
})

class Authenticator {
  constructor () {
    this.cookie = ''
    this.lastLogin = false

    this.loadLastCookie()
  }

  loadLastCookie() {
    try{
      let obj = jsonfile.readFileSync(file)

      if(obj){
        this.cookie = obj.cookie
        this.lastLogin = obj.lastLogin
      }
    }catch(e){

    }
  }

  async saveLastCookie() {
    return new Promise((resolve, reject) => {
      jsonfile.writeFile(file, {
        cookie: this.cookie,
        lastLogin: this.lastLogin
      }, (err) => {
        if (err) reject(err)

        resolve()
      })
    })
  }

  async login () {
    return new Promise((resolve, reject) => {
      request(loginOptions(config.password), async (error, response, body) => {
        if (!error && response.statusCode == 200) {
          let cookie = response.headers['set-cookie']

          if (!cookie) return reject('Invalid password')

          this.cookie = cookie[0]
          this.lastLogin = new Date().getTime()
          this.saveLastCookie()

          console.log('Auth success: ' + cookie[0])
          resolve(cookie[0])
        }
      })
    })
  }

  async logout () {
    return new Promise((resolve, reject) => {
      request(logoutRequest(this.cookie), (error, response, body) => {
        if (!error && response.statusCode == 200) {
          if (error) return reject(error)
          this.cookie = ''
          this.lastLogin = false
          this.saveLastCookie().then(() => {
            console.log('Logout success')
            resolve(true)
          })
        }
      })
    })
  }

  async getPortStatistics () {
    return new Promise(async (resolve, reject) => {

      try{
        if(!this.lastLogin){
          console.log("Attempting login, no last cookie found")
          await this.login()
        }else{
          let msSinceLogin = new Date().getTime() - this.lastLogin

          if(msSinceLogin > maxSessionTime){
            console.log("Session may expire soon. Renewing")
            await this.logout()
            await this.login()
          }else{
            console.log("Session still valid.")
          }
        }
      }catch(e){
        console.log(e)
        return reject(e)
      }

      request(portStatisticsRequest(this.cookie), (error, response, body) => {
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
          resolve(result)
        }else{
          reject(error)
        }
      })
    })
  }

  getCookie () {
    return this.cookie
  }
}

module.exports = Authenticator