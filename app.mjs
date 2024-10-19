import express from 'express';
import { google } from 'googleapis';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import helmet from 'helmet';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Adicione o middleware para analisar JSON
app.use(express.json());
app.use(express.static('views'));

// Define o equivalente de __dirname para módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/callback' // Redirecionamento após autenticação
);

// Rota para página de autenticação
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
  });
  res.redirect(authUrl);
});

// Callback do Google OAuth2
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Armazene os tokens de acesso em uma sessão (ou localStorage no frontend)
  res.redirect('/home.html'); // Redireciona para a home
});

// Rota para o chat
app.post('/chat', async (req, res) => {
  console.log(req.body);  // Verifique o que está sendo recebido na requisição
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).send('Mensagem não encontrada no corpo da requisição.');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    const data = await response.json();

    // Acesse o conteúdo da mensagem
    const chatGptMessage = data.choices[0].message.content;
    console.log(chatGptMessage);  // Verifica o conteúdo exato da resposta

    res.json({ reply: chatGptMessage });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao comunicar com a API do ChatGPT');
  }
});

// Rota para criar a planilha na API do Google Sheets
app.post('/spreadsheets', async (req, res) => {
  try {
    // O JSON completo com 'title' e 'sheets' é recebido diretamente do ChatGPT via requisição
    const sheetRequest = req.body; // Espera receber o JSON com a estrutura que o ChatGPT gerou
    console.log(sheetRequest);

    // Enviar a requisição diretamente para a API do Google Sheets
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client }); // Inicializa a API do Google Sheets
    const response = await sheets.spreadsheets.create({
      resource: sheetRequest // Usar o JSON completo do corpo da requisição
    });

    // Retornar o ID da planilha criada
    res.json({ spreadsheetId: response.data.spreadsheetId });

  } catch (error) {
    console.error('Erro ao criar a planilha:', error);
    res.status(500).json({ error: 'Erro ao criar a planilha' });
  }
});

// Rota para exibir as planilhas do usuário
app.get('/spreadsheets', async (req, res) => {
  if (!oauth2Client.credentials) {
    return res.status(401).send('Usuário não autenticado. Por favor, faça login.');
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name)',
    });

    res.json(response.data.files);
  } catch (error) {
    console.error('Erro ao buscar planilhas:', error);
    res.status(500).send('Erro ao buscar planilhas do Google Drive');
  }
});

// Rota para obter dados de uma planilha específica
app.post('/spreadsheets/data', async (req, res) => {
  const { spreadsheetId, range } = req.body;

  if (!oauth2Client.credentials) {
    return res.status(401).send('Usuário não autenticado. Por favor, faça login.');
  }

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const sheetData = response.data.values;
    res.json(sheetData); // Retorna os dados da planilha
  } catch (error) {
    console.error('Erro ao obter dados da planilha:', error);
    res.status(500).send('Erro ao obter dados da planilha');
  }
});

app.get('/user-info', (req, res) => {
  const user = req.user; // Supondo que você tenha a informação do usuário na requisição
  res.json({ name: user.displayName }); // Retorne o nome do usuário
});

// Rota para listar as abas de uma planilha específica
app.get('/spreadsheets/:spreadsheetId/sheets', async (req, res) => {
  const { spreadsheetId } = req.params;

  if (!oauth2Client.credentials) {
      return res.status(401).send('Usuário não autenticado. Por favor, faça login.');
  }

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  try {
      const response = await sheets.spreadsheets.get({
          spreadsheetId: spreadsheetId,
          includeGridData: false, // Não precisa incluir os dados da grade para apenas listar as abas
      });

      const sheetTitles = response.data.sheets.map(sheet => ({
          properties: {
              title: sheet.properties.title,
          },
      }));

      res.json({ sheets: sheetTitles });
  } catch (error) {
      console.error('Erro ao obter abas da planilha:', error);
      res.status(500).send('Erro ao obter abas da planilha');
  }
});

// Páginas frontend
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

app.get('/spreadsheets', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'spreadsheets.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Helmet para segurança
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://apis.google.com"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);
