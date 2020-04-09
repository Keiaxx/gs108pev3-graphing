const Authenticator = require('./authenticate')

// authenticator().then((result) => {
//   console.log(result)
// }).catch((e) => {
//   console.log(e)
// })

const auth = new Authenticator()

async function test() {
  let loginCookie = await auth.login()

  console.log("Current cookie " + auth.getCookie())

  let result = await auth.getPortStatistics()

  console.log(result)

  let logoutResult = await auth.logout()

  console.log(logoutResult + " " + auth.getCookie())
}

test()