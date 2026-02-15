import { config, collection, fields } from '@keystatic/core';

export default config({
  storage: {
    kind: 'local',
  },
  collections: {
    games: collection({
      label: 'Games',
      slugField: 'name',
      path: 'src/content/games/*',
      format: { contentField: 'description' },
      schema: {
        name: fields.text({
          label: 'Name',
          validation: { isRequired: true },
        }),
        image: fields.text({
          label: 'Image Path',
          validation: { isRequired: true },
        }),
        imageAlt: fields.text({
          label: 'Image Alt Text',
          validation: { isRequired: true },
        }),
        youtubeLink: fields.text({
          label: 'YouTube Link',
        }),
        description: fields.document({
          label: 'Description',
          formatting: true,
          dividers: true,
          links: true,
        }),
        tag: fields.text({
          label: 'Primary Tag',
          validation: { isRequired: true },
        }),
        tags: fields.array(
          fields.text({
            label: 'Tag',
          }),
          {
            label: 'Additional Tags',
            itemLabel: (props) => props.value || 'Tag',
          }
        ),
        editeur: fields.text({
          label: 'Publisher',
        }),
        players: fields.text({
          label: 'Number of Players',
        }),
        duration: fields.text({
          label: 'Duration',
        }),
        difficulty: fields.integer({
          label: 'Difficulty',
          validation: {
            min: 1,
            max: 5,
          },
        }),
        age: fields.text({
          label: 'Age',
        }),
      },
    }),
    tags: collection({
      label: 'Tags',
      slugField: 'title',
      path: 'src/content/tags/*',
      format: { contentField: 'description' },
      schema: {
        title: fields.text({
          label: 'Title',
          validation: { isRequired: true },
        }),
        description: fields.document({
          label: 'Description (optional)',
        }),
      },
    }),
    editeurs: collection({
      label: 'Publishers',
      slugField: 'name',
      path: 'src/content/editeurs/*',
      format: { contentField: 'description' },
      schema: {
        name: fields.text({
          label: 'Name',
          validation: { isRequired: true },
        }),
        description: fields.document({
          label: 'Description (optional)',
        }),
      },
    }),
  },
});
