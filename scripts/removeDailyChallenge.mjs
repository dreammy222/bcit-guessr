import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

// Initialize AWS Client
const cleanKey = (val) => val ? val.replace(/^"|"$/g, '') : '';

const client = new DynamoDBClient({
  region: cleanKey(process.env.AWS_REGION) || "us-west-1",
  credentials: {
      accessKeyId: cleanKey(process.env.AWS_ACCESS_KEY_ID) || "",
      secretAccessKey: cleanKey(process.env.AWS_SECRET_ACCESS_KEY) || ""
  }
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMO_TABLE_NAME;
if (!TABLE_NAME) {
    console.error("DYNAMO_TABLE_NAME env var is required");
    process.exit(1);
}

async function removeDailyChallengeField() {
    console.log(`Scanning table ${TABLE_NAME}...`);
    
    try {
        const scanCommand = new ScanCommand({
            TableName: TABLE_NAME,
            ProjectionExpression: "id"
        });
        
        const response = await docClient.send(scanCommand);
        const items = response.Items || [];
        
        console.log(`Found ${items.length} items. Removing dailyChallenge field...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const item of items) {
            const updateCommand = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { id: item.id },
                UpdateExpression: "REMOVE dailyChallenge"
            });
            
            try {
                await docClient.send(updateCommand);
                successCount++;
                if (successCount % 10 === 0) {
                    process.stdout.write('.');
                }
            } catch (error) {
                console.error("\nFailed to update item " + item.id + " error: " + error.name + " " + error.message);
                failCount++;
            }

        }
        
        console.log(`\nUpdate complete:`);
        console.log(`- Successfully updated (removed field): ${successCount}`);
        console.log(`- Failed: ${failCount}`);
        
    } catch (error) {
        console.error("Error scanning/updating table:", error.message);
    }
}

removeDailyChallengeField();
