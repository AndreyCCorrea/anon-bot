const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function generate() {
  console.log('\n==================================================');
  console.log('   🔑 GERADOR DE STRING SESSION (GramJS)');
  console.log('==================================================\n');

  const apiIdStr = await question('1️⃣  Digite seu API_ID (obtido em https://my.telegram.org): ');
  const apiId = parseInt(apiIdStr.trim(), 10);
  const apiHash = (await question('2️⃣  Digite seu API_HASH: ')).trim();

  if (!apiId || !apiHash) {
    console.error('❌ API_ID e API_HASH são obrigatórios!');
    rl.close();
    return;
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await question('3️⃣  Digite seu número com DDI (ex: +5511999999999): '),
    password: async () => await question('4️⃣  Digite a senha de 2 etapas (se houver, ou dê Enter): '),
    phoneCode: async () => await question('5️⃣  Digite o código enviado pelo Telegram: '),
    onError: (err) => console.error('Erro:', err),
  });

  console.log('\n✅ Autenticação realizada com sucesso!');
  console.log('\n=================== SUASTING SESSION ===================\n');
  console.log(client.session.save());
  console.log('\n========================================================\n');
  console.log('Copie a string acima e cole na variável STRING_SESSION do EasyPanel.');

  await client.disconnect();
  rl.close();
  process.exit(0);
}

generate().catch((err) => {
  console.error('❌ Erro ao gerar sessão:', err);
  rl.close();
  process.exit(1);
});
