// Função serverless (roda no servidor do Netlify, não no navegador do visitante).
// A chave de API fica só aqui, lida de uma variável de ambiente.
//
// Configure em: Netlify → Project configuration → Environment variables
//   Nome:  ANTHROPIC_API_KEY
//   Valor: sua chave começando com sk-ant-...
//
// IMPORTANTE — por que o trabalho é dividido em duas etapas:
// Funções do Netlify têm um teto rígido de 30s. Gerar roteiro longo + títulos +
// descrição + tags de uma vez só estourava esse tempo. Agora o front-end chama
// esta função DUAS vezes: etapa "roteiro" (gancho/roteiro/encerramento) e etapa
// "metadados" (títulos/descrição/tags). Cada uma é bem mais curta e termina com
// folga dentro do limite.

const TOOL_ROTEIRO = {
  name: "salvar_roteiro",
  description: "Salva o roteiro narrado do vídeo.",
  input_schema: {
    type: "object",
    properties: {
      gancho: {
        type: "string",
        description: "As 2-3 primeiras frases do roteiro, com tensão/pergunta/promessa nos primeiros segundos.",
      },
      roteiro: {
        type: "string",
        description:
          "Roteiro completo em 8 a 10 parágrafos, com enquadramento de direita, pronto para narração. Cerca de 800 a 1000 palavras. Desenvolva contexto, antecedentes e implicações — sem inventar fatos, números, datas ou falas que não estejam no resumo da notícia.",
      },
      encerramento: {
        type: "string",
        description:
          "Fechamento em 1 parágrafo curto, retomando o tema do vídeo antes de convidar a se inscrever, ativar o sininho e comentar a opinião — sem soar genérico.",
      },
    },
    required: ["gancho", "roteiro", "encerramento"],
  },
};

const TOOL_METADADOS = {
  name: "salvar_metadados",
  description: "Salva os metadados de publicação do vídeo no YouTube.",
  input_schema: {
    type: "object",
    properties: {
      titulos: {
        type: "array",
        items: { type: "string" },
        description: "3 opções de título para o YouTube, cada uma com até 70 caracteres.",
      },
      descricao_seo: {
        type: "string",
        description: "Descrição de até 4 linhas, com a palavra-chave principal nas primeiras 150 caracteres.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "12 a 18 tags curtas para o YouTube, sem #.",
      },
    },
    required: ["titulos", "descricao_seo", "tags"],
  },
};

const LINHA_EDITORIAL = `Você trabalha para um canal de YouTube de política brasileira com linha editorial genuinamente de direita/conservadora — não neutra. Adote o ponto de vista, o enquadramento e as ênfases que um comentarista de direita brasileiro real usaria (crítica a excessos do STF, defesa de liberdades individuais, ceticismo em relação a pautas identificadas com a esquerda, valorização de família e livre mercado quando pertinente) — sem inventar fatos que não estejam na notícia.`;

async function chamarAnthropic(apiKey, { prompt, tool, maxTokens }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 24000);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`API da Anthropic: ${msg}`);
  }

  const toolUse = (data.content || []).find((b) => b.type === "tool_use");
  if (!toolUse?.input) {
    throw new Error("A IA não devolveu o conteúdo estruturado.");
  }
  return toolUse.input;
}

export async function handler(event) {
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

  const { etapa, title, source, category, summary, roteiroGerado } = payload;
  if (!title) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltou o título da notícia." }) };
  }

  const contextoNoticia = `Notícia:
Título: "${title}"
Fonte: ${source || "desconhecida"}
Categoria: ${category || "Geral"}
Resumo: ${summary || title}`;

  try {
    const inicio = Date.now();

    if (etapa === "metadados") {
      const prompt = `${LINHA_EDITORIAL}

${contextoNoticia}

Roteiro já produzido para este vídeo:
${(roteiroGerado || "").slice(0, 4000)}

Gere os metadados de publicação no YouTube usando a ferramenta "salvar_metadados".`;

      const resultado = await chamarAnthropic(apiKey, { prompt, tool: TOOL_METADADOS, maxTokens: 1000 });
      console.log(`Etapa metadados concluída em ${Date.now() - inicio}ms`);
      return { statusCode: 200, body: JSON.stringify(resultado) };
    }

    // etapa padrão: roteiro
    const prompt = `${LINHA_EDITORIAL}

${contextoNoticia}

Meta de duração: o roteiro completo (gancho + corpo + encerramento) deve render entre 6 e 7 minutos de narração — cerca de 900 a 1050 palavras no total, a ~150 palavras por minuto. Como o resumo é curto, ganhe esse tempo desenvolvendo contexto e implicações, não inventando fatos.

Use a ferramenta "salvar_roteiro" para entregar o resultado.`;

    const resultado = await chamarAnthropic(apiKey, { prompt, tool: TOOL_ROTEIRO, maxTokens: 2500 });
    console.log(`Etapa roteiro concluída em ${Date.now() - inicio}ms`);
    return { statusCode: 200, body: JSON.stringify(resultado) };
  } catch (e) {
    if (e.name === "AbortError") {
      console.error("Chamada à Anthropic abortada após 24s.");
      return {
        statusCode: 504,
        body: JSON.stringify({ error: "A IA demorou demais para responder (mais de 24s). Tente de novo." }),
      };
    }
    console.error("Erro na função generate-script:", e);
    return { statusCode: 500, body: JSON.stringify({ error: String(e.message || e) }) };
  }
}
