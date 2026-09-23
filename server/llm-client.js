const hasRuntimeFetch = typeof fetch === 'function';

// 线上模型必须通过服务端环境变量显式配置，避免把平台地址或密钥写进作品代码。
const DEFAULT_BASE_URL = '';
const DEFAULT_MODEL = 'gpt-4o-mini';

// ── 上下文感知 mock 逻辑 ──
// 当没有 API key 或请求失败时，根据用户消息内容生成**不同的**回复
function generateContextualMockReply({ systemPrompt, messages }) {
  // 提取用户最后一条消息
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const userText = (lastUserMsg?.content || '').toLowerCase();

  // 从 systemPrompt 中提取用户档案信息
  const profileMatch = {
    gender: systemPrompt.match(/"gender"\s*:\s*"([^"]*)"/),
    goal: systemPrompt.match(/"goal"\s*:\s*"([^"]*)"/),
    split: systemPrompt.match(/"split"\s*:\s*"([^"]*)"/),
    daysPerWeek: systemPrompt.match(/"daysPerWeek"\s*:\s*(\d+)/),
    currentDayType: systemPrompt.match(/"currentDayType"\s*:\s*"([^"]*)"/),
    sleepHours: systemPrompt.match(/"sleepHours"\s*:\s*([\d.]+)/),
    stressLevel: systemPrompt.match(/"stressLevel"\s*:\s*"([^"]*)"/),
    nutritionPhase: systemPrompt.match(/"nutritionPhase"\s*:\s*"([^"]*)"/),
    proteinCompliance: systemPrompt.match(/"proteinCompliance"\s*:\s*"([^"]*)"/),
    focusArea: systemPrompt.match(/"focusArea"\s*:\s*"([^"]*)"/),
    painStatus: systemPrompt.match(/"painStatus"\s*:\s*"([^"]*)"/),
  };

  const profile = {};
  for (const [key, match] of Object.entries(profileMatch)) {
    if (match) profile[key] = match[1];
  }

  const dayType = profile.currentDayType || '未知';
  const goal = profile.goal || '增肌';
  const focusArea = profile.focusArea || '';

  // ── 根据用户问题关键词分类回复（按特异性从高到低排序） ──

  // 优先级 1: 问疼痛/受伤（最紧急）
  if (/疼|痛|伤|受伤|不舒服|膝盖|腰|肩|elbow|knee|pain/.test(userText)) {
    const pain = profile.painStatus || '无';
    if (pain && pain !== '无' && pain !== '无疼痛') {
      return `你的疼痛记录显示：${pain}。建议：1) 疼痛部位相关动作暂时替换为不引起疼痛的变体；2) 训练前对该部位做充分热身和筋膜放松；3) 如果疼痛持续超过 1 周或加重，建议看运动医学医生。不要硬撑着练，小伤拖成大伤得不偿失。`;
    }
    return `目前没有记录到疼痛问题，很好！继续保持训练前充分热身（5-10 分钟动态拉伸），训练后做静态拉伸和泡沫轴放松。如果训练中出现关节疼痛（不是肌肉酸痛），立即停止该动作并记录下来。`;
  }

  // 优先级 2: 问 RPE / 重量 / 加重（训练核心问题）
  if (/重量|加重|加重量|加多少|progress|加重多少/.test(userText)) {
    return `关于加重策略：如果上次主项所有组都达到了目标次数且 RPE ≤ 7，下次可以加 2.5%（上肢）或 5%（下肢）。如果 RPE 已经到 8-9，先维持重量、争取多做 1 次再考虑加重。${focusArea ? `考虑到你的重点部位是${focusArea}，可以在该部位相关动作上更积极一些。` : ''}记住，渐进超负荷是关键，但不要跳过太大的台阶。`;
  }

  // 优先级 3: 问饮食/营养
  if (/吃|饮食|营养|蛋白|碳水|meal|diet/.test(userText)) {
    const protein = profile.proteinCompliance || '未知';
    const phase = profile.nutritionPhase || '维持';
    let advice = `你当前的营养阶段是${phase}，蛋白质摄入依从性${protein}。`;
    if (phase.includes('减脂')) {
      advice += '减脂期建议每日热量缺口 300-500 大卡，蛋白质保持每公斤体重 1.8-2.2g，碳水适度减少但训练前后要保证有能量。多吃瘦肉、鸡蛋、蔬菜，减少精制糖。';
    } else if (phase.includes('增肌') || phase.includes('增重')) {
      advice += '增肌期建议每日热量盈余 200-400 大卡，蛋白质每公斤体重 1.6-2.0g，碳水是你训练的主要燃料——不要怕碳水，尤其训练日。加餐可以选香蕉+酸奶或全麦面包+鸡胸肉。';
    } else {
      advice += '维持期建议热量平衡，蛋白质每公斤体重 1.6-1.8g，保证三餐规律，训练后 1 小时内补充蛋白质+碳水。';
    }
    return advice;
  }

  // 优先级 4: 问减脂/有氧
  if (/减脂|减脂期|有氧|跑步|跑步机|cardio|燃脂|瘦/.test(userText)) {
    return `减脂期训练建议：1) 力量训练不要停——这是保住肌肉的关键，可以维持重量但减少总组数 1-2 组；2) 有氧建议每周 3-4 次，每次 30-40 分钟，心率保持在最大心率的 60-70%（约 130-150 bpm）；3) 如果你喜欢 HIIT，每周 1-2 次，每次 15-20 分钟即可，不要过度；4) 饮食是减脂的核心，力量+有氧只是加速器。热量缺口控制在 300-500 大卡/天。`;
  }

  // 优先级 5: 问臀/腿针对性
  if (/臀|翘臀|臀推|glute|butt/.test(userText)) {
    return `想要强化臀部训练：1) 深蹲时站距稍宽、脚尖外展 30°，下沉时膝盖跟随脚尖方向；2) 臀推是孤立臀部最好的动作，4 组 × 10-12 次，顶峰收缩 2 秒；3) 绳索后踢腿 3 组 × 15 次/侧；4) 保加利亚分腿蹲 3 组 × 10 次/侧，前脚踩高一点更练臀。注意所有臀部动作都要先激活臀中肌（蚌式开合 2 组 × 20 次）。`;
  }
  if (/股四|大腿前侧|quad|大腿/.test(userText)) {
    return `强化股四头肌：1) 深蹲是首选，可以尝试前蹲（前蹲更练股四）4 组 × 6-8 次；2) 腿举 3 组 × 12 次，脚放低一点更练股四；3) 保加利亚分腿蹲 3 组 × 10 次/侧；4) 腿屈伸 3 组 × 15 次做收尾。训练后拉伸股四头肌 30 秒/侧，防止过度紧张影响膝关节。`;
  }

  // 优先级 6: 问胸
  if (/胸|胸肌|chest|卧推/.test(userText)) {
    return `练胸建议：主项平板卧推 4 组 × 6-8 次（RPE 7-8），上斜哑铃推举 3 组 × 10 次练上胸，哑铃飞鸟 3 组 × 12 次练胸肌拉伸感。如果你觉得胸肌外侧不够饱满，可以加双杠臂屈伸 3 组 × 10 次。注意卧推时肩胛骨后缩下沉，杠铃下放到乳头位置。`;
  }

  // 优先级 7: 问背
  if (/背|背阔|引体|划船|back/.test(userText)) {
    return `练背建议：引体向上或高位下拉 4 组 × 8-10 次练背阔肌宽度，杠铃划船 3 组 × 8 次练厚度，坐姿划船 3 组 × 12 次练中背部。如果你想背更宽，引体向上宽握；想更厚，多做划船类动作。发力时先沉肩再拉，不要用二头借力。`;
  }

  // 优先级 8: 问肩
  if (/肩|三角肌|推举|lateral|shoulder/.test(userText)) {
    return `练肩建议：站姿杠铃推举 4 组 × 6-8 次练整体肩部力量，侧平举 4 组 × 12-15 次练中束（这个最关键，决定视觉宽度），俯身飞鸟 3 组 × 12 次练后束。侧平举用小重量、控制好节奏，不要借力甩上去。肩部恢复较慢，同一部位间隔 48 小时以上再练。`;
  }

  // 优先级 9: 问休息/恢复/睡眠
  if (/休息|恢复|睡眠|睡|累|疲劳|overtrain|rest|recover/.test(userText)) {
    const sleep = profile.sleepHours || '未知';
    const stress = profile.stressLevel || '未知';
    return `你的睡眠时长是${sleep}小时，压力水平${stress}。恢复建议：保证每晚 7-9 小时睡眠（目前${sleep}小时${parseFloat(sleep) < 7 ? '偏少，建议多睡一会儿' : '不错，保持'}），训练日之间至少休息 24-48 小时同一肌群。${stress.includes('高') ? '压力偏高时可以减少训练量 20-30%，多做静态拉伸和深呼吸放松。' : '压力适中，正常训练节奏即可。'}如果连续 3 天以上感觉疲劳累积，果断安排一天积极恢复日。`;
  }

  // 优先级 10: 问训练计划/分化
  if (/计划|分化|split|几次|几天|频率|安排/.test(userText)) {
    const split = profile.split || '未设定';
    const days = profile.daysPerWeek || '未设定';
    return `你当前的训练分化是${split}，每周训练${days}天。${days >= 4 ? '4 天以上可以很好地覆盖每个肌群 2 次/周，这是增肌最优频率。' : '3 天以下建议用全身训练或上下肢分化，确保每个肌群每周至少练到 1-2 次。'}如果你觉得恢复不过来，可以减少辅助动作的组数；如果觉得量不够，可以在主项后增加 1-2 个孤立动作。`;
  }

  // 优先级 11: 问状态/今天感觉
  if (/状态|感觉|怎么样|好不好|行不行|可以吗/.test(userText)) {
    return `根据你的训练记录，最近的训练完成度不错。${focusArea ? `你的重点训练部位是${focusArea}，建议在该部位的训练日多关注动作质量和肌肉感受。` : ''}今天的训练日类型是${dayType}，建议主项做到 RPE 7-8，如果感觉状态好可以挑战一下多做 1 次；如果感觉一般，维持重量把辅助动作完成就好。训练不是每次都要 PR，一致性比单次强度更重要。`;
  }

  // 优先级 12: 问「今天练什么」（最宽泛，放最后）
  if (/今天|today|练什么|练哪/.test(userText)) {
    const dayMap = {
      'push': '今天是你推的训练日（胸/肩/三头）。建议主项选平板卧推或上斜哑铃推举，4 组 × 6-8 次。辅助动作可以加哑铃飞鸟 3 组 × 12 次和绳索下压 3 组 × 15 次。',
      'pull': '今天是拉的训练日（背/二头）。主项建议引体向上或杠铃划船，4 组 × 6-8 次。辅助加坐姿划船 3 组 × 10 次和哑铃弯举 3 组 × 12 次。',
      'legs': '今天是腿日。主项建议深蹲或硬拉，4 组 × 5-8 次。如果你偏翘臀可以加臀推 4 组 × 10 次；偏股四头肌可以做腿举 3 组 × 12 次。',
      'rest': '今天是休息日。建议做 20-30 分钟低强度有氧（快走/游泳），配合全身拉伸和泡沫轴放松。睡眠和营养跟上，明天训练状态会更好。',
      'chest': '今天练胸。主项平板卧推 4 组 × 6-8 次，上斜哑铃推举 3 组 × 10 次，哑铃飞鸟 3 组 × 12 次。注意肩胛骨后缩下沉，保护肩关节。',
      'back': '今天练背。主项引体向上或高位下拉 4 组 × 8-10 次，杠铃划船 3 组 × 8 次，坐姿划船 3 组 × 12 次。注意发力时先沉肩再拉。',
      'shoulders': '今天练肩。主项站姿推举 4 组 × 6-8 次，侧平举 4 组 × 12-15 次，俯身飞鸟 3 组 × 12 次。侧平举用小重量控制好节奏。',
    };
    return dayMap[dayType] || `今天你的训练日类型是${dayType}。建议主项动作 4 组 × 6-8 次做到 RPE 7-8，辅助动作 3 组 × 10-12 次。记得练前热身 5-10 分钟。`;
  }

  // ── 默认回复：综合分析 ──
  return `我是你的健身教练 AI，${goal === '减脂' ? '减脂' : goal === '增肌' ? '增肌' : '健身'}路上我帮你把控训练和恢复。你可以问我：\n\n• 今天练什么？— 我根据你的训练分化给出今天的训练安排\n• 这个动作该加重量吗？— 我根据 RPE 给你加重建议\n• 饮食怎么吃？— 我根据你的营养阶段给个性化建议\n• 状态不好怎么办？— 我帮你判断是该练还是该休息\n• 臀腿/胸背/肩怎么练？— 我给你针对性的训练方案\n\n${focusArea ? `考虑到你的重点部位是${focusArea}，我会在相关训练日给你更精准的建议。` : ''}有什么想问的尽管说！`;
}

async function callOpenAICompatible({ systemPrompt, messages, tools }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  console.log('[LLM] apiKey present:', !!apiKey, 'hasFetch:', hasRuntimeFetch, 'tools:', !!tools);
  console.log('[LLM] baseUrl:', baseUrl, 'model:', model);

  // 没有 API key 时，使用上下文感知的 mock 逻辑（而非固定一句话）
  if (!apiKey || !baseUrl || !hasRuntimeFetch) {
    console.log('[LLM] API configuration unavailable, using mock mode');
    return {
      text: generateContextualMockReply({ systemPrompt, messages }),
      mode: 'mock',
    };
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    console.log('[LLM] Calling API:', url);

    const body = {
      model,
      temperature: 0.6,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    console.log('[LLM] API response status:', response.status);

    if (!response.ok) {
      const bodyText = await response.text();
      console.log('[LLM] API error body:', bodyText);
      throw new Error(`LLM_HTTP_${response.status}`);
    }

    const data = await response.json();
    console.log('[LLM] API raw response:', JSON.stringify(data).slice(0, 1200));

    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('LLM_EMPTY');

    // 检查是否有 function call
    const toolCalls = message.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const firstCall = toolCalls[0];
      if (firstCall.type === 'function') {
        console.log('[LLM] Function call detected:', firstCall.function.name);
        return {
          text: null,
          functionCall: {
            name: firstCall.function.name,
            arguments: firstCall.function.arguments,
          },
          mode: 'live',
        };
      }
    }

    const text = message.content?.trim();
    if (!text) throw new Error('LLM_EMPTY');
    console.log('[LLM] API success, got reply length:', text.length);
    return { text, mode: 'live' };
  } catch (err) {
    console.log('[LLM] API call failed:', err.message);
    // API 调用失败时，也使用上下文感知 mock 作为降级
    return {
      text: generateContextualMockReply({ systemPrompt, messages }),
      mode: 'mock-fallback',
    };
  }
}

module.exports = {
  callOpenAICompatible,
};
