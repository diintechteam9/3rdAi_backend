/**
 * Gemini AI Utility
 * Uses @google/generative-ai SDK with key from DB (admin panel) or env fallback
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import AppSettings from '../models/AppSettings.js';
import Client from '../models/Client.js';
import mongoose from 'mongoose';

// Resolve Gemini key: per-client → app-level → env
export const getGeminiApiKey = async (clientId = null) => {
    if (clientId) {
        const isObjectId = mongoose.Types.ObjectId.isValid(clientId) && String(clientId).length === 24;
        const client = isObjectId
            ? await Client.findById(clientId).select('settings.geminiApiKey').lean()
            : await Client.findOne({ clientId: String(clientId) }).select('settings.geminiApiKey').lean();
        if (client?.settings?.geminiApiKey) return client.settings.geminiApiKey.trim();
    }

    const settings = await AppSettings.getSettings();
    if (settings?.geminiApiKey) return settings.geminiApiKey.trim();

    return process.env.GEMINI_API_KEY?.trim() || null;
};

/**
 * Get active AI provider from settings
 */
export const getAiProvider = async () => {
    const settings = await AppSettings.getSettings();
    return settings?.aiProvider || 'gemini';
};

/**
 * Get chat completion from Gemini using generateContent (most compatible)
 * @param {Array} messages - [{role: 'user'|'assistant'|'system', content: string}]
 * @param {Object} options - { model }
 * @param {string|null} clientId
 */
export const getGeminiChatCompletion = async (messages, options = {}, clientId = null) => {
    const apiKey = await getGeminiApiKey(clientId);
    if (!apiKey) {
        console.error('[Gemini] No API key found in DB or env');
        return { success: false, content: '', error: 'Gemini API key not configured' };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: options.model || 'gemini-1.5-flash'
        });

        // Build a single combined prompt from all messages
        const parts = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                parts.push(`[System]: ${msg.content}`);
            } else if (msg.role === 'user') {
                parts.push(`[User]: ${msg.content}`);
            } else if (msg.role === 'assistant') {
                parts.push(`[Assistant]: ${msg.content}`);
            }
        }

        const fullPrompt = parts.join('\n\n') + '\n\n[Assistant]:';

        const result = await model.generateContent(fullPrompt);
        const text = result.response.text();

        console.log('[Gemini] Response received, length:', text.length);
        return { success: true, content: text.trim() };
    } catch (error) {
        console.error('[Gemini] Error:', error.message);
        return { success: false, content: '', error: error.message };
    }
};
