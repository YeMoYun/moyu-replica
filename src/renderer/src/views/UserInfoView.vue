<template>
  <div class="user">
    <header class="head">
      <h3>个人中心</h3>
      <button class="btn ghost" @click="go('/home')">返回</button>
    </header>

    <div class="card">
      <p class="sub">放松一下，但别被老板发现 👀</p>
      <div class="row"><span>账号</span><b>{{ username || '未登录' }}</b></div>
      <div class="row"><span>用户类型</span><b>{{ userTypeText }}</b></div>
      <div class="row"><span>会员状态</span><b>{{ statusText }}</b></div>
      <div class="row"><span>到期时间</span><b>{{ expire || '—' }}</b></div>
      <div class="row"><span>邀请人数</span><b>{{ inviteCount }}</b></div>
      <div class="row">
        <span>邀请码</span>
        <input v-model="inviteCode" placeholder="输入邀请码" />
      </div>
      <button class="btn full mt" @click="go('/pay')">升级会员</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const userType = ref(3)
const status = ref(3)
const expire = ref('')
const inviteCount = ref(0)
const inviteCode = ref('')

const TYPE = { 1: '试用会员', 2: '正式会员', 3: '非会员', 4: '月度会员', 5: '季度会员', 6: '年费会员', 7: '永久会员' }
const STATUS = { 0: '试用已到期', 1: '正常', 2: '会员已封禁', 3: '未开通' }
const userTypeText = computed(() => TYPE[userType.value] || '非会员')
const statusText = computed(() => STATUS[status.value] || '未开通')

function go(p) {
  router.push(p)
}

onMounted(async () => {
  try {
    username.value = (await window.authApi.getUserName()) || ''
  } catch {}
})
</script>

<style scoped>
.user {
  height: 100%;
  background: #f7f8fa;
  padding: 16px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.head h3 {
  margin: 0;
}

.sub {
  color: #888;
  margin: 0 0 12px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}

.row input {
  width: 160px;
}

.full {
  width: 100%;
}

.mt {
  margin-top: 14px;
}
</style>