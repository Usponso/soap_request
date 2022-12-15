"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoapController = void 0;
const easy_soap_request_1 = __importDefault(require("easy-soap-request"));
const fs_1 = __importDefault(require("fs"));
const xml_js_1 = __importDefault(require("xml-js"));
const json2csv_1 = require("json2csv");
const mysql_1 = __importDefault(require("mysql"));
class SoapController {
    constructor() {
        this.url = "https://otmgtm-a420717-dev1.otm.em2.oraclecloud.com:443/GC3Services/CommandService/call";
        this.headers = {
            'Content-Type': 'text/xml;charset=UTF-8',
            'soapAction': 'http://xmlns.oracle.com/apps/otm/CommandService/xmlExport',
        };
        this.con = mysql_1.default.createConnection(`mysql://${process.env.user}:${process.env.password}@${process.env.host}/${process.env.database}?connectTimeout=300000&acquireTimeout=300000&waitForConnections=true&keepAlive=30&charset=utf8mb4`);
    }
    getDataInterval(tables, start, end) {
        return __awaiter(this, void 0, void 0, function* () {
            let startTime = performance.now();
            for (const table of tables) {
                console.log("TABLE : " + table); //TODO delete console.log
                let total = yield this.getTotalByInterval(table, start, end); //Get the number of rows for the selected year
                let cpt = 0;
                let json = [];
                let promises = [];
                let statement = `SELECT * FROM (SELECT t.*, rownum r FROM ${table} t WHERE to_char(t.insert_date,'YYYY-MM-DD') BETWEEN '${start}' AND '${end}') WHERE r&gt;${cpt} and r&lt;=${cpt + 200}`;
                while (cpt < total) { //total
                    promises.push((0, easy_soap_request_1.default)({ url: this.url, headers: this.headers, xml: this.getXMLQuery(table, statement) })
                        .then(({ response: { body } }) => {
                        let result = JSON.parse(xml_js_1.default.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                        console.log(`${table} : processing query..`); //TODO delete console.log
                        return result;
                    }).catch((errorBody) => {
                        console.error('ERROR : ' + errorBody); //TODO delete console.log
                    }));
                    cpt = cpt + 200;
                    statement = `SELECT * FROM (SELECT t.*, rownum r FROM ${table} t WHERE to_char(t.insert_date,'YYYY-MM-DD') BETWEEN '${start}' AND '${end}') WHERE r&gt;${cpt} and r&lt;=${cpt + 200}`;
                    yield new Promise(resolve => setTimeout(resolve, 150)); //avoid econnreset
                }
                yield Promise.all(promises)
                    .then(res => {
                    console.log("### " + table + " ended ###"); //TODO delete console.log
                    res.forEach(promise => {
                        if (promise != undefined)
                            promise.forEach((current) => {
                                json.push(current.attributes);
                            });
                    });
                    console.log("TAILLE JSON : " + json.length); //TODO delete console.log
                    this.con.query(`SHOW TABLES LIKE '${table}';`, (err, res) => __awaiter(this, void 0, void 0, function* () {
                        if (err)
                            throw err;
                        let create = '';
                        let tableObject = {};
                        let statement = `SELECT DISTINCT COLUMN_NAME FROM all_tab_cols WHERE table_name = '${table.toUpperCase()}'`;
                        yield (0, easy_soap_request_1.default)({ url: this.url, headers: this.headers, xml: this.getXMLQuery("COLUMNS", statement) })
                            .then(({ response: { body } }) => {
                            let result = JSON.parse(xml_js_1.default.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                            result.forEach((el) => {
                                if (create.length)
                                    create += ',';
                                create += el.attributes.COLUMN_NAME + ' TEXT'; //+ ' ' + el.attributes.DATA_TYPE + `(${el.attributes.DATA_LENGTH}),`
                                tableObject[el.attributes.COLUMN_NAME] = '';
                            });
                        });
                        if (!res.length) { //Table not exists, then create one
                            let sql = `CREATE TABLE ${table}(${create + ',R TEXT'})`;
                            this.con.query(sql, (err, res) => {
                                if (err)
                                    console.log(err);
                            });
                        }
                        for (let i = 0; i < json.length; i = i + 200) {
                            let sliced = json.slice(i, i + 200);
                            let obj = tableObject;
                            let values = [];
                            for (let j = 0; j < sliced.length; j++) {
                                let keys = Object.keys(sliced[j]);
                                keys.forEach(key => {
                                    obj[key] = sliced[j][key];
                                });
                                values.push(Object.values(obj));
                            }
                            let sql = `INSERT INTO ${table}(${Object.keys(tableObject)}) VALUES ?`;
                            this.con.query(sql, [values], (err, res) => {
                                if (err)
                                    console.log(err);
                                console.log('INSERTING..'); //TODO delete console.log
                            });
                            yield new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }));
                    let cpt = 0;
                    for (let i = 0; i < json.length; i = i + 150000) {
                        cpt++;
                        let sliced = json.slice(i, i + 150000);
                        fs_1.default.writeFileSync(`results/${table}_${cpt}.csv`, (0, json2csv_1.parse)(sliced));
                    }
                });
            }
            ;
            let endTime = performance.now();
            console.log("TOTAL EXECUTION TIME : " + (endTime - startTime) / 1000 + "s"); //TODO delete console.log
        });
    }
    getTotalByInterval(table, start, end) {
        return __awaiter(this, void 0, void 0, function* () {
            let statement = `SELECT COUNT(*) as TOTAL FROM ${table} WHERE to_char(insert_date,'YYYY-MM-DD') BETWEEN '${start}' AND '${end}'`;
            let json = [];
            yield (0, easy_soap_request_1.default)({ url: this.url, headers: this.headers, xml: this.getXMLQuery("COUNT", statement) }).then(({ response: { body, statusCode } }) => __awaiter(this, void 0, void 0, function* () {
                let result = JSON.parse(xml_js_1.default.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                if (result[0].text != "NO DATA")
                    json = json.concat(result);
                console.log(statusCode); //TODO delete console.log
            })).catch((errorBody) => {
                console.error('ERROR : ' + errorBody);
            });
            return json[0].attributes.TOTAL;
        });
    }
    getDataByTableDaily(table, year) {
        return __awaiter(this, void 0, void 0, function* () {
            let date = new Date(`${year}-01-01`);
            let WHERE = "";
            let start = "";
            let json = [];
            while (date.getFullYear() != Number.parseInt(year) + 1) {
                start = date.toISOString().split('T')[0];
                WHERE = `to_char(INSERT_DATE, 'YYYY-MM-DD') = '${start}'`;
                yield (0, easy_soap_request_1.default)({ url: this.url, headers: this.headers, xml: this.getXMLDBOject(table, WHERE) }).then(({ response: { body, statusCode } }) => __awaiter(this, void 0, void 0, function* () {
                    let result = JSON.parse(xml_js_1.default.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                    if (result[0].text != "NO DATA")
                        json = json.concat(result);
                    console.log(statusCode); //TODO delete console.log
                })).catch((errorBody) => {
                    console.error('ERROR : ' + errorBody);
                });
                date.setDate(date.getDate() + 1);
            }
            fs_1.default.appendFileSync('results/result.json', JSON.stringify(json));
        });
    }
    getDataByTableWeekly(table, year) {
        return __awaiter(this, void 0, void 0, function* () {
            let date = new Date(`${year}-01-01`);
            let tmpDate = new Date(`${year}-01-01`);
            let WHERE = "";
            let start = "";
            let end = "";
            let json = [];
            while (date.getFullYear() != Number.parseInt(year) + 1) {
                tmpDate.setDate(tmpDate.getDate() + 7);
                if (tmpDate.getFullYear() == Number.parseInt(year) + 1) {
                    break;
                }
                start = date.toISOString().split('T')[0];
                end = tmpDate.toISOString().split('T')[0];
                WHERE = `to_char(INSERT_DATE, 'YYYY-MM-DD') BETWEEN '${start}' AND '${end}'`;
                yield (0, easy_soap_request_1.default)({ url: this.url, headers: this.headers, xml: this.getXMLDBOject(table, WHERE) }).then(({ response: { body, statusCode } }) => __awaiter(this, void 0, void 0, function* () {
                    let result = JSON.parse(xml_js_1.default.xml2json(body)).elements[0].elements[1].elements[0].elements[0].elements[0].elements;
                    if (result[0].text != "NO DATA")
                        json = json.concat(result);
                    console.log(statusCode); //TODO delete console.log
                })).catch((errorBody) => {
                    console.error('ERROR : ' + errorBody);
                });
                date.setDate(date.getDate() + 7);
            }
            fs_1.default.appendFileSync('results/result.json', JSON.stringify(json));
        });
    }
    getXMLDBOject(name, WHERE) {
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
    getXMLQuery(rootname, statement) {
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
exports.SoapController = SoapController;
//# sourceMappingURL=controller.js.map