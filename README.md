# Exporting OTM data via soap requests

[![TypeScript](https://badgen.net/badge/icon/typescript?icon=typescript&label)](https://typescriptlang.org)

## Features

- Provide a list of table you want to extract
- Provide a date range for the data you want to extract
- Create .CSV files, sliced in 150k lines max per file (ex: myTable has 280k lines => myTable_1.csv, myTable_2.csv)
- Insert in database the result :construction: