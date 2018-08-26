from scaleway.apis import AccountAPI
import json

print("Running deploy script")

json_data= open('./scalewayconf.json').read()

config = json.loads(json_data)

api = AccountAPI(auth_token=config['secretKey'])

resp = api.query(serialize=False).organizations.get()
print(resp.json())


