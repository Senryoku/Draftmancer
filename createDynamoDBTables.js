import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}
import AWS from "aws-sdk";

AWS.config.update({
	region: process.env.AWS_REGION,
	endpoint: process.env.AWS_ENDPOINT,
});

const dynamodb = new AWS.DynamoDB();

AWS.config.getCredentials(function(err) {
	if (err) {
		console.log(err.stack); // credentials not loaded
	} else if (AWS.config.credentials) {
		console.log("AWS Credentials loaded.");
		console.log("Access key:", AWS.config.credentials.accessKeyId);
		console.log("Secret access key:", AWS.config.credentials.secretAccessKey);
	}
});

const createCallback = function(err, data) {
	if (err) {
		console.error("Unable to create table. Error JSON:", JSON.stringify(err, null, 2));
	} else {
		console.log("Created table. Table description JSON:", JSON.stringify(data, null, 2));
	}
};

const params = [
	{
		TableName: "mtga-draft-connections",
		KeySchema: [
			{ AttributeName: "userID", KeyType: "HASH" }, // Partition key
		],
		AttributeDefinitions: [{ AttributeName: "userID", AttributeType: "S" }],
		ProvisionedThroughput: {
			ReadCapacityUnits: 5,
			WriteCapacityUnits: 5,
		},
	},
	{
		TableName: "mtga-draft-sessions",
		KeySchema: [
			{ AttributeName: "id", KeyType: "HASH" }, // Partition key
		],
		AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
		ProvisionedThroughput: {
			ReadCapacityUnits: 5,
			WriteCapacityUnits: 5,
		},
	},
	{
		TableName: "mtga-draft-session-logs",
		KeySchema: [
			{ AttributeName: "id", KeyType: "HASH" }, // Partition key
		],
		AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
		ProvisionedThroughput: {
			ReadCapacityUnits: 5,
			WriteCapacityUnits: 5,
		},
	},
];

for (let p of params) dynamodb.createTable(p, createCallback);
