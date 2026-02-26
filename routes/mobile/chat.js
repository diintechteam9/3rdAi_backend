import express from 'express';
import Chat from '../../models/Chat.js';
import { authenticate } from '../../middleware/auth.js';
import { getGeminiChatCompletion, getAiProvider } from '../../utils/gemini.js';
import { getChatCompletionFromDb } from '../../utils/openai.js';
import { getPromptContent, PROMPT_KEYS } from '../../services/promptService.js';

const router = express.Router();

/**
 * Diagnostic endpoint - Check authentication status
 * GET /api/mobile/chat/debug
 * Headers: Authorization: Bearer <token>
 */
router.get('/debug', authenticate, async (req, res) => {
  try {
    const debugInfo = {
      hasUser: !!req.user,
      userId: req.user?._id?.toString(),
      userRole: req.user?.role,
      tokenRole: req.decodedRole,
      userEmail: req.user?.email,
      userIsActive: req.user?.isActive,
      roleMatch: req.user?.role === req.decodedRole,
      userObjectKeys: req.user ? Object.keys(req.user) : [],
      timestamp: new Date().toISOString()
    };

    console.log('[Chat Debug]', debugInfo);

    res.json({
      success: true,
      message: 'Debug information',
      data: debugInfo
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get debug info'
    });
  }
});

/**
 * Create a new chat
 * POST /api/mobile/chat
 * Headers: Authorization: Bearer <token>
 * Body: { title? }
 */
router.post('/', authenticate, async (req, res) => {
  try {
    // Allow both 'user' and 'client' roles
    const tokenRole = req.decodedRole;

    if (tokenRole !== 'user' && tokenRole !== 'client' && tokenRole !== 'partner') {
      console.error('[Chat POST] Access denied - Wrong role:', {
        tokenRole: tokenRole,
        requiredRoles: ['user', 'client', 'partner']
      });
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint is only for 'user', 'client', or 'partner' roles. Your current role is '${tokenRole}'.`,
        error: 'INVALID_ROLE',
        requiredRoles: ['user', 'client', 'partner'],
        currentRole: tokenRole
      });
    }

    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User not found.',
        error: 'USER_NOT_FOUND'
      });
    }

    const { title } = req.body;

    const chat = new Chat({
      userId: tokenRole === 'user' ? req.user._id : undefined,
      clientId: tokenRole === 'client' ? req.user._id : (req.clientId || req.user?.clientId || undefined),
      partnerId: tokenRole === 'partner' ? req.user._id : undefined,
      title: title || 'New Chat',
      messages: []
    });

    await chat.save();

    res.status(201).json({
      success: true,
      message: 'Chat created successfully',
      data: {
        chatId: chat._id,
        title: chat.title,
        createdAt: chat.createdAt
      }
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create chat'
    });
  }
});

/**
 * Get all chats for the user
 * GET /api/mobile/chat
 * Headers: Authorization: Bearer <token>
 */
router.get('/', authenticate, async (req, res) => {
  try {
    // CRITICAL: This endpoint is ONLY for 'user' role
    // Get role from token (source of truth)
    const tokenRole = req.decodedRole;
    const userRole = req.user?.role;

    // Debug logging
    console.log('[Chat GET] Request received:', {
      hasUser: !!req.user,
      userId: req.user?._id?.toString(),
      tokenRole: tokenRole,
      userRole: userRole,
      userEmail: req.user?.email,
      endpoint: '/api/mobile/chat',
      requiredRole: 'user'
    });

    // STRICT CHECK: Only 'user', 'client', or 'partner' role allowed
    if (tokenRole !== 'user' && tokenRole !== 'client' && tokenRole !== 'partner') {
      console.error('[Chat GET] Access denied - Wrong role:', {
        tokenRole: tokenRole,
        requiredRoles: ['user', 'client', 'partner'],
        userId: req.user?._id?.toString(),
        message: `This endpoint requires 'user', 'client', or 'partner' role. Current role: '${tokenRole}'`
      });
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint is only for 'user', 'client', or 'partner' roles. Your current role is '${tokenRole}'.`,
        error: 'INVALID_ROLE',
        requiredRoles: ['user', 'client', 'partner'],
        currentRole: tokenRole
      });
    }

    // Double check user object role matches
    if (userRole && userRole !== tokenRole) {
      console.warn(`[Chat GET] User object role mismatch, but token role is correct. Updating user.role to ${tokenRole}.`);
      req.user.role = tokenRole;
    }

    if (!req.user) {
      console.error('[Chat GET] No user object in request');
      return res.status(403).json({
        success: false,
        message: 'Access denied. User not found.',
        error: 'USER_NOT_FOUND'
      });
    }

    console.log('[Chat GET] Access granted, fetching chats for:', req.user._id, 'Role:', tokenRole);

    const matchQuery = tokenRole === 'client'
      ? { clientId: req.user._id }
      : tokenRole === 'partner'
        ? { partnerId: req.user._id }
        : { userId: req.user._id, ...req.tenantFilter };

    const chats = await Chat.find(matchQuery)
      .select('_id title messages createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    // Add message count and last message preview
    const chatsWithPreview = chats.map(chat => ({
      chatId: chat._id,
      title: chat.title,
      messageCount: chat.messages.length,
      lastMessage: chat.messages.length > 0
        ? chat.messages[chat.messages.length - 1].content.substring(0, 100)
        : null,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    }));

    res.json({
      success: true,
      data: {
        chats: chatsWithPreview
      }
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch chats'
    });
  }
});

/**
 * Get a specific chat with all messages
 * GET /api/mobile/chat/:chatId
 * Headers: Authorization: Bearer <token>
 */
router.get('/:chatId', authenticate, async (req, res) => {
  try {
    // Allow both 'user' and 'client' roles
    const tokenRole = req.decodedRole;

    if (tokenRole !== 'user' && tokenRole !== 'client' && tokenRole !== 'partner') {
      console.error('[Chat GET :chatId] Access denied - Wrong role:', {
        tokenRole: tokenRole,
        requiredRoles: ['user', 'client', 'partner']
      });
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint is only for 'user', 'client', or 'partner' roles. Your current role is '${tokenRole}'.`,
        error: 'INVALID_ROLE',
        requiredRoles: ['user', 'client', 'partner'],
        currentRole: tokenRole
      });
    }

    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User not found.',
        error: 'USER_NOT_FOUND'
      });
    }

    const { chatId } = req.params;

    const matchQuery = tokenRole === 'client'
      ? { _id: chatId, clientId: req.user._id }
      : tokenRole === 'partner'
        ? { _id: chatId, partnerId: req.user._id }
        : { _id: chatId, userId: req.user._id, ...req.tenantFilter };

    const chat = await Chat.findOne(matchQuery);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    res.json({
      success: true,
      data: {
        chatId: chat._id,
        title: chat.title,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch chat'
    });
  }
});

/**
 * Send a message in a chat (create new chat if chatId not provided)
 * POST /api/mobile/chat/:chatId/message
 * Headers: Authorization: Bearer <token>
 * Body: { message }
 */
router.post('/:chatId/message', authenticate, async (req, res) => {
  try {
    // Allow both 'user' and 'client' roles
    const tokenRole = req.decodedRole;

    if (tokenRole !== 'user' && tokenRole !== 'client' && tokenRole !== 'partner') {
      console.error('[Chat POST :chatId/message] Access denied - Wrong role:', {
        tokenRole: tokenRole,
        requiredRoles: ['user', 'client', 'partner']
      });
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint is only for 'user', 'client', or 'partner' roles. Your current role is '${tokenRole}'.`,
        error: 'INVALID_ROLE',
        requiredRoles: ['user', 'client', 'partner'],
        currentRole: tokenRole
      });
    }

    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User not found.',
        error: 'USER_NOT_FOUND'
      });
    }

    const { chatId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Find or create chat
    const matchQuery = tokenRole === 'client'
      ? { _id: chatId, clientId: req.user._id }
      : tokenRole === 'partner'
        ? { _id: chatId, partnerId: req.user._id }
        : { _id: chatId, userId: req.user._id, ...req.tenantFilter };

    let chat = await Chat.findOne(matchQuery);

    const resolvedClientId = tokenRole === 'client' ? req.user._id : (req.clientId || req.user?.clientId || undefined);
    const resolvedUserId = tokenRole === 'user' ? req.user._id : undefined;
    const resolvedPartnerId = tokenRole === 'partner' ? req.user._id : undefined;

    if (!chat && chatId !== 'new') {
      // Create new chat if chatId doesn't exist
      chat = new Chat({
        userId: resolvedUserId,
        clientId: resolvedClientId,
        partnerId: resolvedPartnerId,
        title: message.substring(0, 50) || 'New Chat',
        messages: []
      });
    } else if (!chat) {
      // Create new chat if chatId is 'new'
      chat = new Chat({
        userId: resolvedUserId,
        clientId: resolvedClientId,
        partnerId: resolvedPartnerId,
        title: message.substring(0, 50) || 'New Chat',
        messages: []
      });
    }

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message.trim()
    });

    let systemPrompt = 'You are 3rdAI, a warm and empathetic spiritual wellness guide. Offer concise, actionable guidance rooted in mindfulness and positive habits.';
    try {
      const storedPrompt = await getPromptContent(PROMPT_KEYS.MOBILE_CHAT_ASSISTANT);
      if (storedPrompt && typeof storedPrompt === 'string' && storedPrompt.trim().length > 0) {
        systemPrompt = storedPrompt.trim();
      }
    } catch (promptError) {
      console.warn('[Chat POST :chatId/message] Failed to load mobile chat prompt. Using fallback.', promptError.message);
    }

    // Prepare messages for OpenAI (format: { role, content })
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...chat.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    // Determine which AI provider to use from admin settings
    const aiProvider = await getAiProvider();
    console.log('[Chat] Using AI provider:', aiProvider);

    let aiResponse;
    if (aiProvider === 'openai') {
      aiResponse = await getChatCompletionFromDb(openaiMessages, {}, req.clientId || req.user?.clientId || null);
    } else {
      aiResponse = await getGeminiChatCompletion(openaiMessages, {}, req.clientId || req.user?.clientId || null);
    }

    if (!aiResponse.success) {
      return res.status(503).json({
        success: false,
        message: `AI service unavailable. Please configure ${aiProvider === 'openai' ? 'OpenAI' : 'Gemini'} API key in Admin → Tools page. Error details: ${aiResponse.error || 'Unknown error'}`
      });
    }

    // Add assistant message
    chat.messages.push({
      role: 'assistant',
      content: aiResponse.content
    });

    // Update chat title if it's the first message
    if (chat.messages.length === 2 && chat.title === 'New Chat') {
      chat.title = message.substring(0, 50) || 'New Chat';
    }

    await chat.save();

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        chatId: chat._id,
        userMessage: {
          role: 'user',
          content: message.trim()
        },
        assistantMessage: {
          role: 'assistant',
          content: aiResponse.content
        },
        usage: aiResponse.usage
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send message'
    });
  }
});

/**
 * Delete a chat
 * DELETE /api/mobile/chat/:chatId
 * Headers: Authorization: Bearer <token>
 */
router.delete('/:chatId', authenticate, async (req, res) => {
  try {
    // Allow both 'user' and 'client' roles
    const tokenRole = req.decodedRole;

    if (tokenRole !== 'user' && tokenRole !== 'client' && tokenRole !== 'partner') {
      console.error('[Chat DELETE :chatId] Access denied - Wrong role:', {
        tokenRole: tokenRole,
        requiredRoles: ['user', 'client', 'partner']
      });
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint is only for 'user', 'client', or 'partner' roles. Your current role is '${tokenRole}'.`,
        error: 'INVALID_ROLE',
        requiredRoles: ['user', 'client', 'partner'],
        currentRole: tokenRole
      });
    }

    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User not found.',
        error: 'USER_NOT_FOUND'
      });
    }

    const { chatId } = req.params;

    const matchQuery = tokenRole === 'client'
      ? { _id: chatId, clientId: req.user._id }
      : tokenRole === 'partner'
        ? { _id: chatId, partnerId: req.user._id }
        : { _id: chatId, userId: req.user._id, ...req.tenantFilter };

    const chat = await Chat.findOneAndDelete(matchQuery);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete chat'
    });
  }
});

export default router;

