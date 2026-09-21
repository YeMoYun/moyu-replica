<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name==='wx-chat'"><path d="M12 2C6.5 2 2 6.2 2 11.4c0 2.5 1 4.7 2.8 6.4L3.5 22l4.6-2.1c1.2.5 2.5.8 3.9.8 5.5 0 10-4.2 10-9.3S17.5 2 12 2Z" fill="currentColor" stroke="none"/></template>
    <template v-else-if="name==='wx-contacts'"><circle cx="9" cy="6" r="4"/><path d="M1 22v-3a8 8 0 0 1 16 0v3ZM17 4h6M18 8h5M18 12h5"/></template>
    <template v-else-if="name==='wx-moments'"><circle cx="12" cy="12" r="10"/><path d="m12 2 5 10H7Zm10 10L12 17V7ZM12 22 7 12h10ZM2 12l10-5v10Z"/></template>
    <template v-else-if="name==='wx-mini'"><circle cx="12" cy="12" r="10"/><path d="M9 16a3 3 0 0 1-3-3 3 3 0 0 1 3-3h2V8a3 3 0 0 1 6 0 3 3 0 0 1-3 3h-2v3a3 3 0 0 1-3 3"/></template>
    <template v-else-if="name==='device'"><rect x="5" y="1" width="14" height="22" rx="1"/><path d="M5 18h14M11 21h2"/></template>
    <template v-else-if="name==='search'"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></template>
    <template v-else-if="name==='menu'"><path d="M4 6h16M4 12h16M4 18h16"/></template>
    <template v-else-if="name==='more'"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></template>
    <template v-else-if="name==='close'"><path d="m5 5 14 14M19 5 5 19"/></template>
    <template v-else-if="name==='plus'"><path d="M12 4v16M4 12h16"/></template>
    <template v-else-if="name==='smile'"><circle cx="12" cy="12" r="9"/><path d="M8 15a5 5 0 0 0 8 0M8 8v2M16 8v2"/></template>
    <template v-else-if="name==='cube'"><path d="m12 2 10 5-10 5L2 7ZM2 7v11l10 5 10-5V7M12 12v11"/></template>
    <template v-else-if="name==='folder'"><path d="M2 6V4h7l3 3h10v14H2V6ZM2 10h20"/></template>
    <template v-else-if="name==='cut'"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/></template>
    <template v-else-if="name==='phone-video'"><path d="M4 4 1 5c0 9 7 17 17 18l2-3-5-4-3 2c-3-1-6-4-7-7l2-3Z"/><rect x="13" y="2" width="7" height="6" rx="1"/><path d="m20 4 3-2v6l-3-2"/></template>
  </svg>
</template>
<script setup>defineProps({name:String})</script>
