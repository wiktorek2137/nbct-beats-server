const port = process.env.PORT || 3001
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const mysql = require('mysql');
require('dotenv').config()
const app = express()
const nodemailer = require('nodemailer')
app.use(cors())
// {
//     'origin':"*",
//     'Content-Type': 'text/plain',
//     'Access-Control-Allow-Origin' : '*',
//     'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE'
// // }
// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*');
//     next()
// })

const paymentsToCheck = []
let interval = setIntervalAsActive()
app.get('/addPaymentId', (req, res) => {
    const paymentId = req.query.paymentId;
    const index = paymentsToCheck.indexOf(paymentId);
    index == -1 && paymentsToCheck.push(paymentId)
    if (!interval) {
        interval = setIntervalAsActive()
    }
    res.redirect(`https://beaty.nobocoto.pl/order_confirm.php?paymentId=${paymentId}`);
})
app.listen(port, () => console.log(`Server running on port ${port}`))

function setIntervalAsActive() {
    return setInterval(() => {
        console.log(paymentsToCheck)
        if (paymentsToCheck.length == 0) {
            console.log('Interval is stopped')
            clearInterval(interval)
            interval = undefined
        }
        else {
            paymentsToCheck.forEach(payment => checkPaymentStatus(payment))
        }
    }, 5000)
}
function checkPaymentStatus(id) {
    const options = {
        method: 'GET',
        url: `https://api.sandbox.paynow.pl/v1/payments/${id}/status`,
        headers: {
            'Api-Key': process.env.apiKey,
            'Accept': '*/*'
        }

    }
    axios.request(options).then(response => {
        const paymentId = response.data.paymentId
        const paymentStatus = response.data.status;
        console.log(paymentId, paymentStatus)
        if (paymentStatus != 'PENDING') {
            updateDatabase(paymentId, paymentStatus)
        }
    }).catch(error => { })
}

function updateDatabase(id, status) {
    const connection = mysql.createConnection({
        host: process.env.dbHost,
        user: process.env.dbUser,
        password: process.env.dbPassword,
        database: process.env.dbName,
    });

    connection.connect((err) => {
        if (err) throw err;
        console.log('Connected to MySQL!');
    });

    const sqlSelect = "UPDATE payments SET payment_status='" + status + "' WHERE payment_number='" + id + "'";
    if (status == 'CONFIRMED') {
        sendConfirmationEmail(id)
    }

    connection.query(sqlSelect, (err, rows) => {
        if (err) throw err;
        const index = paymentsToCheck.indexOf(id);
        index > -1 && paymentsToCheck.splice(index, 1)
    });
    connection.end((err) => {
        if (err) throw err;
        console.log('Connection closed.');
    });
}
function sendConfirmationEmail(paymentId) {
    const connection = mysql.createConnection({
        host: process.env.dbHost,
        user: process.env.dbUser,
        password: process.env.dbPassword,
        database: process.env.dbName,
    });

    connection.connect((err) => {
        if (err) throw err;
        console.log('Connected to MySQL!');
    });

    const sqlSelect = `SELECT orders.order_id, orders.order_date, users.user_email FROM users JOIN orders ON orders.user_id=users.user_id JOIN payments ON orders.payment_id=payments.payment_id WHERE payment_number='${paymentId}'`
    connection.query(sqlSelect, (err, res) => {
        if (err) throw err
        const orderId = res[0].order_id
        const userEmail = res[0].user_email
        const orderDate = res[0].order_date
        const formattedDate = orderDate.toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        if (res.length) {
            const selectAllOrdersInfo = `SELECT order_id,beat_title,order_price,order_license,beat_music,beat_wav,beat_stem,beat_exclusive FROM orders_info JOIN beaty ON orders_info.beat_id=beaty.beat_id WHERE order_id=${orderId}`
            connection.query(selectAllOrdersInfo, (error, response) => {
                if (error) throw error
                const ordersDetails = response.map(row => {
                    const license = row.order_license
                    let link = null
                    if (license === 'MP3') {
                        link = 'https://beaty.nobocoto.pl/' + row.beat_music;
                    } else if (license === 'WAV') {
                        link = row.beat_wav;
                    } else if (license === 'STEM') {
                        link = row.beat_stem;
                    } else if (license === 'EXCLUSIVE') { // to sprawdzić
                        if (row.beat_stem) {
                            link = row.beat_stem;
                        } else if (row.beat_wav) {
                            link = row.beat_wav;
                        } else if (row.beat_music) {
                            link = 'https://beaty.nobocoto.pl/' + row.beat_music;
                        }
                    }
                    return (`<tr class="order-item">
                    <td class="montserrat-light black-text">${row.beat_title}</td>
                    <td class="montserrat-light black-text">${row.order_license}</td>
                    <td class="montserrat-light price black-text">${row.order_price}PLN</td>
                    <td class="montserrat-light black-text"><a download href="${link}">Pobierz</a></td>
                </tr>`)
                })
                const messageHeader = `<tr>
                <td><span class="montserrat-bold black-text">ZAMÓWIENIE #${orderId}</span></td>
            </tr>
            <tr>
                <td><span class="montserrat-bold black-text">DATA ZAMÓWIENIA: ${formattedDate}</span></td>
            </tr>
            <tr>
                <td><span class="montserrat-bold black-text">NUMER PŁATNOŚCI:${paymentId}</span></td>
            </tr>`
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: 'process.env.gmailUser', // email
                        pass: 'process.env.gmailPassword'  // kod
                    }
                });

                const mailOptions = {
                    from: 'nobocotowwa@gmail.com', //email
                    to: userEmail,
                    subject: `Zamówienie #${orderId} | NBCT Beats`,
                    html: `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet"><title>NBCT BEATS</title><style>body {font-family: 'Montserrat', Arial, sans-serif;margin: 0;padding: 0;box-sizing: border-box;}table {width: 100%;border-collapse: collapse;}.mail-header, .mail-footer, .mail-content {max-width: 600px;margin: 20px auto;overflow: hidden;}.mail-header, .mail-footer {text-align: center;padding: 20px;border-bottom: 1px solid #EBEBEB; /* Only for header */}.mail-header-desc{align: left;max-width: 600px;margin: 20px auto;overflow: hidden;}.mail-header {align: center;}.mail-footer {background-color: black;color: white;border: none;}.mail-content {padding: 20px;background-color: #FFFFFF;}.montserrat-light, .montserrat-bold {font-weight: 300;text-decoration: none;color: inherit;}.montserrat-bold {font-weight: 700;}td, th {padding: 10px 0;}.price{text-align: right;}.order-item td {border-top: 1px solid #EBEBEB;border-bottom: 1px solid #EBEBEB;}.black-text{color: black;}.white-text{text-decoration: none;color: white;}.logo{width: 300px;}</style></head><body><div class="mail-header"><img src="cid:logo" class="logo"></div><div class="mail-header-desc">${messageHeader}</div><div class="mail-content"><!-- Content here --><table>${ordersDetails.join('')}</table></div><div class="mail-footer"><a href="https://beaty.nobocoto.pl" class="white-text">Odwiedź naszą stronę</a></div></body></html>`
                };

                transporter.sendMail(mailOptions, function (error, info) {
                    if (error) {
                        console.log(error);
                    } else {
                        console.log('Email sent: ' + info.response);
                    }
                });
            })
        }
        connection.end((err) => {
            if (err) throw err;
            console.log('Connection closed.');
        });
    });
}
function queryDatabase() {
    const connection = mysql.createConnection({
        host: process.env.dbHost,
        user: process.env.dbUser,
        password: process.env.dbPassword,
        database: process.env.dbName,
    });

    connection.connect((err) => {
        if (err) throw err;
        console.log('Connected to MySQL!');
    });

    const sqlSelect = "SELECT * FROM payments WHERE payment_status LIKE 'PENDING'";
    console.log(sqlSelect)

    connection.query(sqlSelect, (err, rows) => {
        if (err) throw err;

        rows.forEach(row => {
            console.log(row.payment_number)
            paymentsToCheck.push(row.payment_number);
        })
    });
    connection.end((err) => {
        if (err) throw err;
        console.log('Connection closed.');
    });
}
queryDatabase()
