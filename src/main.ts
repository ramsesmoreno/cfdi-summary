import yargs  from 'yargs'
import { hideBin } from 'yargs/helpers'
void yargs(hideBin(process.argv))
  .commandDir('commands')
  .strict()
  .alias({ h: 'help' })
  .argv