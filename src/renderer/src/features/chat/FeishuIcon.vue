<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(path,index) in paths[name]||paths.more" :key="index" :d="path"/>
  </svg>
</template>

<script setup>
defineProps({name:String})
const paths={
  search:['M21 21l-4.4-4.4','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  chat:['M4 4h16v12H8l-4 4V4Z'],calendar:['M4 5h16v16H4V5Z','M8 2v6M16 2v6M4 10h16'],
  doc:['M6 2h9l4 4v16H6V2Z','M14 2v5h5M9 12h6M9 16h6'],work:['M3 7h18v14H3V7Z','M8 7V3h8v4'],
  users:['M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z','M1 22a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M16 16a6 6 0 0 1 7 6'],
  smile:['M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z','M8 14s1.5 2 4 2 4-2 4-2M8 9h.01M16 9h.01'],
  at:['M16 8v7a3 3 0 0 0 6 0v-3a10 10 0 1 0-4 8'],cut:['M8 8 21 21M8 16 21 3','M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  plus:['M12 4v16M4 12h16'],settings:['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z','M19 12a7 7 0 0 0-.1-1l2-2-2-3-2.7 1A8 8 0 0 0 14 6l-.5-3h-3L10 6a8 8 0 0 0-2.2 1L5 6 3 9l2 2a7 7 0 0 0 0 2l-2 2 2 3 2.8-1A8 8 0 0 0 10 18l.5 3h3l.5-3a8 8 0 0 0 2.2-1l2.8 1 2-3-2-2Z'],
  send:['M3 3l18 9-18 9 4-9-4-9Z','M7 12h14'],more:['M5 12h.01M12 12h.01M19 12h.01'],close:['M5 5l14 14M19 5 5 19'],menu:['M4 6h16M4 12h16M4 18h16']
}
</script>
