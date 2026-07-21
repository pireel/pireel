/**
 * studio-ui 的 i18n 入口:核心(t/setStudioLocale)在 engine 包(见其头注,含
 * 「中文即 key / 模块作用域禁 t() / 仅客户端」三条铁律);这里把 UI 包自己的
 * en 词典注册进去——**注册挂在模块体**,消费者 import { t } 即触发,不吃
 * sideEffects:false 的摇树(纯副作用导入会被摇掉,别改成那样)。
 */

import { registerEnMessages } from '@pireel/studio-engine/i18n';
import { EN_UI } from './messages-en/index';

export { t, setStudioLocale, studioLocale, missingEn, type StudioLocale } from '@pireel/studio-engine/i18n';

registerEnMessages(EN_UI);
