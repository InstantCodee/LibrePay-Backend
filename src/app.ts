import * as rpc from 'jayson';

async function run() {
    const client = rpc.Client.http({
        port: 18332,
        auth: 'admin:admin'        
    });

    client.request('getnewaddress', ['TestRPC', 'bech32'], (err, response) => {
        if (err) throw err;
        console.log(response.result);
    })
}

run();