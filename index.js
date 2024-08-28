require('dotenv').config();
const AWS = require('aws-sdk');
const MongoClient = require('mongodb').MongoClient;
const nodemailer = require('nodemailer');

const MONGO_URI = process.env.MONGO_URI;
const UserPoolId = process.env.USER_POOL_ID;
const FROM_EMAIL = process.env.FROM_EMAIL;
const TO_EMAILS = process.env.TO_EMAILS.split(',');
const Limit = 60;

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION,
});

const cognito = new AWS.CognitoIdentityServiceProvider();


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    },
    SES: new AWS.SES()
});

exports.handler = async (event) => {
    try {
        // Connect to MongoDB
        const client = await MongoClient.connect(MONGO_URI);
        const db = client.db();
        const sessionsCollection = db.collection('session');
        const usersCollection = db.collection('user');



        // Fetch unique ntidUserId from session collection
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        /**
         * All users which have logged in our system in last 90 days
         */
        const recentSessions = await sessionsCollection.distinct('jwt.ntidUserId', { createdAt: { $gte: ninetyDaysAgo } });

        // Fetch all Cognito users
        let userPoolUsers = [];
        let PaginationToken;
        do {
            const params = {
                UserPoolId,
                Limit,
                PaginationToken,
            };
            const result = await cognito.listUsers(params).promise();
            userPoolUsers = userPoolUsers.concat(result.Users);
            PaginationToken = result.PaginationToken;
        } while (PaginationToken);


        // Process users and compare
        const disabledUsers = [];
        for (const user of userPoolUsers) {

            if (!recentSessions.includes(user?.Username)) {
                // Deactivate Cognito user

                // await cognito.adminDisableUser({
                //     UserPoolId: COGNITO_USER_POOL_ID,
                //     Username: user.Username
                // }).promise();

                // Update MongoDB user collection
                // await usersCollection.updateOne(
                //     { ntidUserId: user.Username },
                //     { $set: { active: false } },
                // );

                disabledUsers.push(user.Username);
            }
        }

        /**
         * Closing DB connection
         */
        await client.close();

        const date = new Date();

        // Send email with disabled users
        if (disabledUsers.length > 0) {
            const mailOptions = {
                from: FROM_EMAIL,
                to: TO_EMAILS,
                subject: `Disabled Users Notification | ${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`,
                text: `The following users (${disabledUsers.length}) have been disabled in ${process.env.NODE_ENV || 'dev'} Environment:\n\n${disabledUsers.join('\n')}`,
                attachments: [
                    {
                        filename: `Disabled NTIDs on ${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}.csv`,
                        content: `NTIDs\n${disabledUsers.join('\n')}`,
                        contentType: 'text/csv'
                    }
                ]
            };
            await transporter.sendMail(mailOptions);
        }

        console.log('Script Executed.')

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Process completed successfully.' })
        };
    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'An error occurred.' })
        };
    }
};
