import soapRequest from 'easy-soap-request';
import fs from 'fs';
import convert from 'xml-js';
import { parse } from 'json2csv';
import mysql from 'mysql';


export class SoapController{
    private url:string = "https://otmgtm-a420717-dev1.otm.em2.oraclecloud.com:443/GC3Services/CommandService/call";
    private headers = {
        'Content-Type': 'text/xml;charset=UTF-8',
        'soapAction': 'http://xmlns.oracle.com/apps/otm/CommandService/xmlExport',
    };

    private con = mysql.createConnection(`mysql://${process.env.user}:${process.env.password}@${process.env.host}/${process.env.database}?connectTimeout=300000&acquireTimeout=300000&waitForConnections=true&keepAlive=30&charset=utf8mb4`)

    public async getDataInterval(tables: string[], start: string, end: string){
        let startTime = performance.now();
        for(const table of tables) {
            console.log("TABLE : " + table); //TODO delete console.log
            let total = await this.getTotalByInterval(table,start, end); //Get the number of rows for the selected year
            let cpt = 0;
            let json: any[] = [];
            let promises: Promise<any>[] = [];
            let statement = `SELECT * FROM (SELECT t.*, rownum r FROM ${table} t WHERE to_char(t.insert_date,'YYYY-MM-DD') BETWEEN '${start}' AND '${end}') WHERE r&gt;${cpt} and r&lt;=${cpt+200}`;
            while(cpt < total){//total
                promises.push(
                    soapRequest({url: this.url, headers: this.headers, xml: this.getXMLQuery(table,statement)})
                    .then(({response: {body}}) => {
                        let result = JSON.parse(convert.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                        console.log(`${table} : processing query..`); //TODO delete console.log
                        return result;
                    }).catch((errorBody) => {
                        console.error('ERROR : ' + errorBody); //TODO delete console.log
                    })
                );
                cpt = cpt+200;
                statement = `SELECT * FROM (SELECT t.*, rownum r FROM ${table} t WHERE to_char(t.insert_date,'YYYY-MM-DD') BETWEEN '${start}' AND '${end}') WHERE r&gt;${cpt} and r&lt;=${cpt+200}`;
                await new Promise(resolve => setTimeout(resolve, 150)); //avoid econnreset
            }
             
            await Promise.all(promises)
            .then(res => {
                console.log("### " + table + " ended ###"); //TODO delete console.log
                res.forEach(promise => {
                    if(promise!=undefined)
                        promise.forEach((current: any) => {
                            json.push(current.attributes);
                        });
                });
                console.log("TAILLE JSON : " + json.length); //TODO delete console.log

                this.con.query(`SHOW TABLES LIKE '${table}';`, async (err,res) => { //Test if table exists
                    if(err) throw err;
                    let create = '';
                    let tableObject: {[k: string]: any} = {};
                    let statement = `SELECT DISTINCT COLUMN_NAME FROM all_tab_cols WHERE table_name = '${table.toUpperCase()}'`;

                    await soapRequest({url: this.url, headers: this.headers, xml: this.getXMLQuery("COLUMNS",statement)})
                    .then(({response: {body}}) => {
                        let result = JSON.parse(convert.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                        result.forEach((el: any) => {
                            if(create.length) create += ',';
                            create += el.attributes.COLUMN_NAME + ' TEXT'; //+ ' ' + el.attributes.DATA_TYPE + `(${el.attributes.DATA_LENGTH}),`
                            tableObject[el.attributes.COLUMN_NAME] = '';
                        });
                    });

                    if(!res.length){ //Table not exists, then create one
                        let sql = `CREATE TABLE ${table}(${create + ',R TEXT'})`;
                        this.con.query(sql ,(err,res) => {
                            if(err) console.log(err);
                        });
                    }

                    for(let i=0; i<json.length; i=i+200){
                        let sliced = json.slice(i,i+200);
                        let obj = tableObject;
                        let values: string[][] = [];
                        for(let j=0; j<sliced.length; j++){
                            let keys = Object.keys(sliced[j]);
                            keys.forEach(key => {
                                obj[key] = sliced[j][key];
                            });
                            values.push(Object.values(obj));
                        }
                        
                        let sql = `INSERT INTO ${table}(${Object.keys(tableObject)}) VALUES ?`;
                        this.con.query(sql, [values] ,(err,res) => {
                            if(err) console.log(err);
                            console.log('INSERTING..'); //TODO delete console.log
                        });
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                });

                let cpt = 0;
                for(let i=0; i<json.length; i=i+150000){
                    cpt++;
                    let sliced = json.slice(i,i+150000);
                    fs.writeFileSync(`results/${table}_${cpt}.csv`, parse(sliced));
                }
            });
        };
        let endTime = performance.now();
        console.log("TOTAL EXECUTION TIME : " + (endTime - startTime)/1000 + "s"); //TODO delete console.log
    }

    public async getTotalByInterval(table: string, start: string, end: string){
        let statement = `SELECT COUNT(*) as TOTAL FROM ${table} WHERE to_char(insert_date,'YYYY-MM-DD') BETWEEN '${start}' AND '${end}'`;
        let json: any[] = [];
        await soapRequest({url: this.url, headers: this.headers, xml: this.getXMLQuery("COUNT",statement)}).then(async ({response: {body, statusCode}}) => {
            let result = JSON.parse(convert.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
            if(result[0].text != "NO DATA") json = json.concat(result);
            console.log(statusCode); //TODO delete console.log
        }).catch((errorBody) => {
            console.error('ERROR : ' + errorBody);
        });
        return json[0].attributes.TOTAL;
    }

    public async getDataByTableDaily(table: string, year: string){
        let date = new Date(`${year}-01-01`);
        let WHERE = "";
        let start = "";
        let json: any[] = [];
        while(date.getFullYear() != Number.parseInt(year) + 1){
            start = date.toISOString().split('T')[0];
            WHERE = `to_char(INSERT_DATE, 'YYYY-MM-DD') = '${start}'`;
            await soapRequest({url: this.url, headers: this.headers, xml: this.getXMLDBOject(table,WHERE)}).then(async ({response: {body, statusCode}}) => {
                let result = JSON.parse(convert.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                if(result[0].text != "NO DATA") json = json.concat(result);
                console.log(statusCode); //TODO delete console.log
            }).catch((errorBody) => {
                console.error('ERROR : ' + errorBody);
            });
            date.setDate(date.getDate() + 1);
        }
        fs.appendFileSync('results/result.json', JSON.stringify(json));
    }

    public async getDataByTableWeekly(table: string, year: string){
        let date = new Date(`${year}-01-01`);
        let tmpDate = new Date(`${year}-01-01`);
        let WHERE = "";
        let start = "";
        let end = "";
        let json: any[] = [];
        while(date.getFullYear() != Number.parseInt(year) + 1){
            tmpDate.setDate(tmpDate.getDate()+7);
            if(tmpDate.getFullYear() == Number.parseInt(year)+1){
                break;
            }
            start = date.toISOString().split('T')[0];
            end = tmpDate.toISOString().split('T')[0];
            WHERE = `to_char(INSERT_DATE, 'YYYY-MM-DD') BETWEEN '${start}' AND '${end}'`;
            await soapRequest({url: this.url, headers: this.headers, xml: this.getXMLDBOject(table,WHERE)}).then(async ({response: {body, statusCode}}) => {
                let result = JSON.parse(convert.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                if(result[0].text != "NO DATA") json = json.concat(result);
                console.log(statusCode); //TODO delete console.log
            }).catch((errorBody) => {
                console.error('ERROR : ' + errorBody);
            });
            date.setDate(date.getDate() + 7);
        }
        fs.appendFileSync('results/result.json', JSON.stringify(json));
    }

    public getXMLDBOject(name: string, WHERE: string): string{
        let xml = `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://xmlns.oracle.com/apps/otm/CommandService" xmlns:dbx="http://xmlns.oracle.com/apps/otm/DBXML">
            <soap:Header>
                <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
                    <wsse:UsernameToken xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
                        <wsse:Username>${process.env.xml_username}</wsse:Username>
                        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${process.env.xml_password}</wsse:Password>
                    </wsse:UsernameToken>
                </wsse:Security>
            </soap:Header>
            <soap:Body>
                <com:xmlExport>
                    <dbx:sql2xml>
                        <dbx:DBObject>
                            <dbx:Name>${name.toUpperCase()}</dbx:Name>
                            <dbx:Predicate>${WHERE}</dbx:Predicate>
                        </dbx:DBObject>
                    </dbx:sql2xml>
                </com:xmlExport>
            </soap:Body>
        </soap:Envelope>`;

        return xml;
    }

    public getXMLQuery(rootname: string, statement: string): string{
        let xml = `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://xmlns.oracle.com/apps/otm/CommandService" xmlns:dbx="http://xmlns.oracle.com/apps/otm/DBXML">
            <soap:Header>
                <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
                    <wsse:UsernameToken xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
                        <wsse:Username>${process.env.xml_username}</wsse:Username>
                        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${process.env.xml_password}</wsse:Password>
                    </wsse:UsernameToken>
                </wsse:Security>
            </soap:Header>
            <soap:Body>
                <com:xmlExport>
                    <dbx:sql2xml>
                        <dbx:Query>
                            <dbx:RootName>${rootname.toUpperCase()}</dbx:RootName>
                            <dbx:Statement>${statement}</dbx:Statement>
                        </dbx:Query>
                    </dbx:sql2xml>
                </com:xmlExport>
            </soap:Body>
        </soap:Envelope>`;
        //SELECT * FROM (SELECT s.*, rownum r FROM shipment s) WHERE r &gt;${start} and r &lt;${end}

        return xml;
    }
}