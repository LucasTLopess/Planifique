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
app.use(express.json()); // <- Adicione esta linha
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
    scope: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  res.redirect(authUrl);
});

// Callback do Google OAuth2
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Armazene os tokens de acesso em uma sessão (ou localStorage no frontend)
  res.redirect('/chat'); // Redireciona para a página do chat
});

// Rota para o chat
app.post('/chat', async (req, res) => {
  const userMessage = req.body.message; // Isso agora deve funcionar corretamente

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
    res.json(data);
  } catch (error) {
    res.status(500).send('Erro ao comunicar com a API');
  }
});

// Rota para exibir as planilhas do usuário
app.get('/spreadsheets', async (req, res) => {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name)',
    });
    res.json(response.data.files);
  } catch (error) {
    res.status(500).send('Erro ao buscar planilhas do Google Drive');
  }
});

// Páginas frontend
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

app.get('/spreadsheets-view', (req, res) => {
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

// Serve static files
app.use(express.static('views'));
