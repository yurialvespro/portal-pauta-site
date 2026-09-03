// Função serverless (roda no servidor do Netlify, não no navegador do visitante).
// A chave de API fica só aqui, lida de uma variável de ambiente — nunca é
// enviada pro código do site, então visitantes não conseguem roubá-la.
//
// Configure em: Netlify → Project configuration → Environment variables
//   Nome:  ANTHROPIC_API_KEY
//   Valor: sua chave começando com sk-ant-...

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método não permitido" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada nas variáveis de ambiente do Netlify." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Corpo da requisição inválido." }) };
  }

  const { title, source, category, summary } = payload;
  if (!title) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltou o título da notícia." }) };
  }

  const prompt = `Você é roteirista de um canal de YouTube de política brasileira. O canal tem linha editorial genuinamente de direita/conservadora — não neutra. Ao narrar o fato, adote o ponto de vista, o enquadramento e as ênfases que um comentarista de direita brasileiro real usaria (crítica a excessos do STF, defesa de liberdades individuais, ceticismo em relação a pautas identificadas com a esquerda, valorização de família e livre mercado quando pertinente ao tema) — sem inventar fatos que não estejam na notícia, apenas o enquadramento e o tom devem refletir esse ponto de vista.

Notícia:
Título: "${title}"
Fonte: ${source || "desconhecida"}
Categoria: ${category || "Geral"}
Resumo: ${summary || title}

Gere APENAS um JSON válido (sem markdown, sem texto fora do JSON):
{
  "gancho": "as 2-3 primeiras frases do roteiro, com tensão/pergunta/promessa nos primeiros segundos",
  "roteiro": "roteiro completo em 4-6 parágrafos curtos, já com o enquadramento de direita descrito acima, pronto para narração",
  "encerramento": "fechamento do roteiro, em 1 parágrafo curto e natural, retomando o tema específico do vídeo antes de convidar a se inscrever no canal, ativar o sininho de notificações e comentar a opinião sobre o assunto tratado — sem soar genérico, deve parecer parte do mesmo raciocínio do roteiro e não um texto colado no final",
  "titulos": ["opção 1 de título, até 70 caracteres", "opção 2", "opção 3"],
  "descricao_seo": "descrição de até 4 linhas para o YouTube, palavra-chave principal nas primeiras 150 caracteres",
  "tags": ["12 a 18 tags curtas para o YouTube, sem #"]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Modelo bom custo-benefício pra esse tipo de texto. Pra economizar
        // ainda mais, troque por "claude-haiku-4-5-20251001".
        model: "claude-sonnet-5",
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: data }) };
    }

    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      return { statusCode: 502, body: JSON.stringify({ error: "Resposta sem conteúdo de texto." }) };
    }

    const clean = textBlock.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return { statusCode: 200, body: JSON.stringify(parsed) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
