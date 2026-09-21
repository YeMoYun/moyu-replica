<template>
  <div class="pay">
    <header class="head">
      <h3>摸鱼会员充值中心 🐟</h3>
      <button class="btn ghost" @click="go('/home')">返回</button>
    </header>

    <h4>选择会员方案</h4>
    <div class="plans">
      <div v-for="p in plans" :key="p.type" class="plan" :class="{ on: selected === p.type }" @click="selected = p.type">
        <div class="p-name">{{ p.name }}</div>
        <div class="p-price">¥{{ p.price }}</div>
        <div class="p-desc">{{ p.desc }}</div>
      </div>
    </div>

    <button class="btn full" @click="pay">立即开通会员（微信支付）</button>

    <div class="faq">
      <h4>会员权益对比</h4>
      <table>
        <tr><th>权益</th><th>试用</th><th>正式</th><th>永久</th></tr>
        <tr><td>全部功能解锁</td><td>7天</td><td>√</td><td>√</td></tr>
        <tr><td>广告皮肤</td><td>√</td><td>√</td><td>√</td></tr>
        <tr><td>伪装窗口</td><td>-</td><td>√</td><td>√</td></tr>
        <tr><td>永久更新</td><td>-</td><td>-</td><td>√</td></tr>
      </table>
      <p class="tip">主体：杭州文砚信息公司 · 浙ICP备2024094822号-4</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const selected = ref(4)
const plans = [
  { type: 1, name: '月度会员', price: 9.9, desc: '30天' },
  { type: 4, name: '季度会员', price: 25, desc: '90天' },
  { type: 6, name: '年费会员', price: 88, desc: '365天' },
  { type: 7, name: '永久会员', price: 168, desc: '终身' }
]

function go(p) {
  router.push(p)
}

function pay() {
  alert('演示版：支付流程对接微信支付（需后端下单接口）。当前功能已解锁。')
}
</script>

<style scoped>
.pay {
  height: 100%;
  background: linear-gradient(160deg, #fff7ed, #fdf2f8);
  padding: 16px;
  overflow: auto;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head h3 {
  margin: 0;
}

.plans {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin: 10px 0 16px;
}

.plan {
  background: #fff;
  border: 2px solid #eee;
  border-radius: 12px;
  padding: 14px;
  text-align: center;
  cursor: pointer;
}

.plan.on {
  border-color: #f59e0b;
}

.p-name {
  font-weight: 700;
}

.p-price {
  color: #ef4444;
  font-size: 20px;
  margin: 6px 0;
}

.p-desc {
  color: #999;
  font-size: 12px;
}

.full {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}

.faq {
  margin-top: 20px;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
}

.faq h4 {
  margin: 0 0 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  border: 1px solid #eee;
  padding: 6px;
  text-align: center;
}

.tip {
  color: #999;
  font-size: 12px;
  margin-top: 10px;
}
</style>