/**
 * 「我的发布」本地记录。
 *
 * 任务书允许"登录和权限可以简化：发布时直接选择身份就行，不用做真实的账号系统"。
 * 所以在没有账号体系的前提下，用 localStorage 记录"本浏览器发布过哪些活动"，
 * 让编辑/删除（选做 S9）有一个合理的边界，而不是让任何人能删任何活动。
 */
const KEY = 'sangzi:my-activities';

export function getMyIds() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

function save(ids) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* 隐私模式下可能不可写，忽略即可 */
  }
}

export function addMyId(id) {
  const ids = getMyIds();
  if (!ids.includes(id)) save([id, ...ids]);
}

export function removeMyId(id) {
  save(getMyIds().filter((x) => x !== id));
}

export function isMine(id) {
  return getMyIds().includes(id);
}
