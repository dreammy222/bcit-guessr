import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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

async function checkItem(id) {
    const command = new GetCommand({
        TableName: "UBCGuessrLocations",
        Key: { id }
    });

    try {
        const response = await docClient.send(command);
        console.log(`Item ${id}:`, JSON.stringify(response.Item, null, 2));
    } catch (error) {
        console.error(`Failed to get item ${id}:`, error.message);
    }
}

checkItem("GS__0210");
