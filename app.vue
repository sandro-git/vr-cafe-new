<template>
  <UHeader :links="links">
    <template #left>
      <div></div>
    </template>
  </UHeader>
  <UMain>
    <NuxtLayout>
      <NuxtPage/>
    </NuxtLayout>
  </UMain>
  <UFooter>
    <template #left>
      Copyright © {{ new Date().getFullYear() }}
    </template>

    <template #right>
      <UButton icon="i-simple-icons-x" color="gray" variant="ghost" to="https://x.com/nuxt_js" target="_blank" />
      <UButton icon="i-simple-icons-discord" color="gray" variant="ghost" to="https://discord.com/invite/ps2h6QT" target="_blank" />
      <UButton icon="i-simple-icons-github" color="gray" variant="ghost" to="https://github.com/nuxt/nuxt" target="_blank" />
    </template>
  </UFooter>
</template>

<script setup>

const links = [{
  label: 'Acceuil',
  to: '/'
}, {
  label: 'Escapes',
  to: '/#Escapes'
}, {
  label: 'Arcade',
  to: '/#Arcades'
}]
</script>
