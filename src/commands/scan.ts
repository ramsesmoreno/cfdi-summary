import type { Arguments, CommandBuilder } from 'yargs'
import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'

type Options = object

export const command = '* [d]'
export const description = 'Buscar archivos XMLs que sean CFDIs y contabilizar su contenido'
export const builder: CommandBuilder<Options, Options> = yargs =>
  yargs
    .option('d', {
      alias: 'dir',
      type: 'string',
      demandOption: false,
      describe: 'Directorio en donde buscar archivos CFDI',
      default: '.'
    })

export const handler = (argv: Arguments<Options>): void  => {
  const { dir } = argv
  const folderName = String(dir).split('/').at(-1) || '.'
  process.stdout.write(`Buscando en el directorio '${folderName}'... `)
  const xmls = fs.readdirSync(dir as string).filter(f => f.split('.').at(-1) === 'xml')
  process.stdout.write(`${xmls.length} xmls encontrados.\n`)
  xmls.forEach(fileName => {
    process.stdout.write(`  - ${fileName}\n`)
    const filePath = `${dir}/${fileName}`
    const fileContent = fs.readFileSync(filePath)
    const parser =  new XMLParser();
    let fileObject = parser.parse(fileContent);
    console.log(fileObject)
  })
  process.stdout.write(`Listo.\n`)
}