<template>
  <UHeader :links="links">
    <template #left>
      <div></div>
    </template>
  </UHeader>
  <UMain>
    <NuxtPage/>
  </UMain>
</template>

<script setup>
const links = [{
  label: 'Acceuil',
  to: '#'
}, {
  label: 'Escapes',
  to: '#'
}, {
  label: 'Arcade',
  to: '#'
}]
</script>
