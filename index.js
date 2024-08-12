
const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
});
const UserPoolId = process.env.USER_POOL_ID;
const Limit = Number(process.env.USER_LOOP_LIMIT) >= 60 ? 60 : Number(process.env.USER_LOOP_LIMIT);
const daysInactive = Number(process.env.DAYS_INACTIVE || 90);

exports.handler = async (_event) => {
    try {
        let paginationToken;
        do {
            const params = {
                UserPoolId,
                Limit,
                PaginationToken: paginationToken
            };

            const response = await cognito.listUsers(params).promise();
            const users = response.Users;

            for (const user of users) {

                const userAuthEvent = await cognito.adminListUserAuthEvents({
                    UserPoolId,
                    Username: user.Username
                }).promise();

                if (!userAuthEvent?.AuthEvents?.length) {
                    continue;
                }

                const lastEvent = userAuthEvent.AuthEvents.pop();

                const lastEventDate = new Date(lastEvent.CreationDate);
                const currentDate = new Date();
                const diffTime = Math.abs(currentDate - lastEventDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > daysInactive) {
                    console.log(`${user.Username} user last activity date is ${lastEventDate.toLocaleDateString()}, Hence disabling user.`);

                    // await cognito.adminDisableUser({
                    //     UserPoolId,
                    //     Username: user.Username
                    // }).promise();
                }
            }

            paginationToken = response.PaginationToken;
        } while (paginationToken);

    } catch (error) {
        console.error(`Error: ${error.message}`);
    }

    return {
        statusCode: 200,
        body: JSON.stringify('Script executed successfully')
    };
};
