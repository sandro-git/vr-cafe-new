<template>
  <ULandingHero class="bg-hero bg-no-repeat h-screen bg-center" />
  <ULandingSection class="lg:w-2/3 lg:mx-auto" title="La Réalité Virtuelle" description="Une activité adapté à partir de 8 ANS. Nous proposons des EXPÉRIENCES variées en Réalité Virtuelle. Un catalogue de Jeux évolutif tous au long de l'année.
Entre amis, en famille, entre collaborateur, tentez l'expérience VR Café." />
  <UPricingGrid class="lg:grid-cols-2 px-52">
    <UPricingCard title="30 min" description="pour" price="18€" cycle="/pers" :button="{ label: 'RESERVER' }" />
    <UPricingCard highlight title="1H" description="à partir de" price="25€" cycle="/pers"
      :button="{ label: 'RESERVER', click: log }" />
  </UPricingGrid>
  <ULandingSection class="lg:w-2/3 lg:mx-auto" title="Le VR Café c'est aussi" 
  description="Notre bar-café, notre terrasse extérieure et nos 220 m2 nous permettent d'acceuillir tout au long de l'année vos évènemens de groupe . Nous organisons vos évènement sur mesure selon votre budget." />
  <ULandingGrid class="lg:w-2/3 lg:mx-auto">
    <ULandingCard class="col-span-6 row-span-2" icon="i-heroicons-swatch" title="Color Palette" description="Choose a primary and a gray color from your Tailwind CSS color palette." />
    <ULandingCard class="col-span-6 row-span-4" icon="i-heroicons-wrench-screwdriver" title="Fully Customizable" description="Change the style of any component in your App Config or with ui prop." />
    <ULandingCard class="col-span-6 row-span-4" icon="i-heroicons-face-smile" title="Icons" description="Choose any of the 100k+ icons from the most popular icon libraries." />
    <ULandingCard class="col-span-6 row-span-2" icon="i-heroicons-computer-desktop" title="Keyboard Shortcuts" description="Nuxt UI comes with a set of Vue composables to easily handle shortcuts." />
  </ULandingGrid>
  <ULandingSection id="Escapes" title="ESCAPE GAMES"/>
  <UContainer class="grid grid-cols-3 grid-flow-row gap-4">
    <Card v-for="game in escapes" :game="game"/>
  </UContainer>
  <ULandingSection id="Arcades" title="ARCADES"/>
  <UContainer class="grid grid-cols-3 grid-flow-row gap-4">
    <Card v-for="game in arcades" :game="game"/>
  </UContainer>
</template>

<script setup>
function log() {
  console.log("click")
};

const escapes= [{
  title:"Alice au Pays des merveilles" ,
  image:"/Alice.jpg"
},
{
  title:"Chernobyl",
  image:"/Chernobyl.jpg"
},
{
  title:"Cyberpunk",
  image:"/Cyberpunk.jpg"
},
{
  title:"House of Fear 2",
  image:"/HOF_2.jpg"
},
{
  title:"House of Fear",
  image:"/House.jpg"
},
{
  title:"Jungle Quest",
  image:"/JQ.jpg"
},
{
  title:"Mission Sigma",
  image:"/Mission Sigma.jpg"
},
{
  title:"Noël",
  image:"/Noël.jpg"
},
{
  title:"Sanctum",
  image:"/Sanctum.jpg"
},
{
  title:"Survival",
  image:"/Survival.jpg"
},
]

const arcades =[
{
  title:"Plush Rush",
  image:"/Plush Rush.jpeg"
},
{
  title:"SMASH POINT",
  image:"/SMASH POINT.jpg"
},
]
</script>
