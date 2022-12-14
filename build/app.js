"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const controller_1 = require("./controller");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT;
let soapController = new controller_1.SoapController();
app.get('/', (req, res) => {
    let tables = [
        'shipment',
        // 'shipment_stop',
        // 'shipment_stop_d',
        // 'order_release',
        // 'ob_order_base',
        // 'ship_unit'
        // 'view_shipment_order_release' //INSERT_DATE field unknown
    ];
    soapController.getDataInterval(tables, '2022-01-01', '2022-12-31');
    res.send('SOAP TS');
});
app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
});
//# sourceMappingURL=app.js.map