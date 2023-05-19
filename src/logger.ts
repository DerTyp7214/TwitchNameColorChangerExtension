export function getTimeString() {
  const date = new Date()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')

  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

export function log(...args: any[]) {
  console.log(
    `%c${getTimeString()} %cTNCCE %c[%cINFO%c]%c`,
    `color: #555; font-weight: bold;`,
    `color: green; font-weight: bold;`,
    `color: #555; font-weight: bold;`,
    `color: #0a79d4; font-weight: bold;`,
    `color: #555; font-weight: bold;`,
    `color: inherit; font-weight: normal;`,
    ...args
  )
}

export function error(...args: any[]) {
  console.log(
    `%c${getTimeString()} %cTNCCE %c[%cERROR%c]%c`,
    `color: #555; font-weight: bold;`,
    `color: green; font-weight: bold;`,
    `color: #555; font-weight: bold;`,
    `color: red; font-weight: bold;`,
    `color: #555; font-weight: bold;`,
    `color: inherit; font-weight: normal;`,
    ...args
  )
}
