import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

const cleanKey = (val) => val ? val.replace(/^"|"$/g, '') : '';

const client = new DynamoDBClient({
  region: cleanKey(process.env.AWS_REGION) || "us-west-1",
  credentials: {
      accessKeyId: cleanKey(process.env.AWS_ACCESS_KEY_ID) || "",
      secretAccessKey: cleanKey(process.env.AWS_SECRET_ACCESS_KEY) || ""
  }
});
const docClient = DynamoDBDocumentClient.from(client);

async function verify() {
    const command = new ScanCommand({
        TableName: "UBCGuessrLocations",
        Limit: 10
    });

    try {
        const response = await docClient.send(command);
        console.log("Verification sample (first 10 items):");
        response.Items.forEach(item => {
            console.log(`ID: ${item.id}, Label: ${item.label}, DailyChallenge: ${item.dailyChallenge}`);
        });
    } catch (error) {
        console.error("Verification failed:", error.message);
    }
}

verify();
